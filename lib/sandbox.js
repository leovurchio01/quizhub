// ============================================================
//  QuizHub OS — bridge di sicurezza per il runner
// ------------------------------------------------------------
//  I quiz sono HTML NON attendibili. Girano in un iframe con
//  sandbox="allow-scripts" (SENZA allow-same-origin): origine
//  opaca, quindi NON possono leggere sessione, cookie, storage
//  o IndexedDB della shell, né chiamare le API dell'app.
//
//  Difese in profondità applicate a ogni quiz:
//   1. sandbox senza allow-same-origin e senza allow-popups
//      (niente window.open verso l'esterno = niente esfiltrazione
//      via URL, niente phishing in finestre nuove);
//   2. una CSP iniettata come <meta> DENTRO il documento del quiz:
//      di default la rete è completamente bloccata (connect-src
//      'none', immagini solo data:/blob:). Un toggle per-quiz può
//      consentire risorse esterne passive (immagini/font/media);
//      fetch/XHR restano comunque vietati anche col toggle.
//   3. lo shim storage è iniettato con JSON "hardenizzato"
//      (niente sequenze </script> o U+2028/29 che possano rompere
//      o riaprire il tag script).
//
//  Problema storico: senza allow-same-origin il loro localStorage
//  lancia un SecurityError e i progressi andrebbero persi.
//  Soluzione: iniettiamo uno shim che espone un localStorage/
//  sessionStorage finti, inizializzati da uno snapshot passato
//  dalla shell, e che rispecchia ogni scrittura al parent via
//  postMessage. La shell li salva (cifrati, se vault) in IndexedDB.
// ============================================================

const ORIGIN_TOKEN = "quizhub-os";

// Un singolo messaggio storage non può superare questa taglia:
// protegge IndexedDB della shell da riempimenti maliziosi.
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024; // 4 MB

// Serializza un valore per l'embedding sicuro dentro <script>:
// JSON.stringify non escapa "<", quindi "</script>" dentro un dato
// controllato dal quiz potrebbe chiudere il tag e iniettare markup.
function jsEmbed(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// CSP del documento quiz. Nota: il doc srcdoc EREDITA già la CSP
// della shell; questa meta si SOMMA (vince la più restrittiva) e
// rende il lockdown esplicito e indipendente dagli header.
function cspMeta(allowRemote) {
  const csp = allowRemote
    ? // risorse passive esterne consentite; script esterni e fetch/XHR no
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data: https:; " +
      "img-src data: blob: https:; media-src data: blob: https:; font-src data: https:; " +
      "connect-src 'none'; form-action 'none'; base-uri 'none'"
    : // lockdown totale: il quiz vive solo di ciò che ha dentro
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; " +
      "img-src data: blob:; media-src data: blob:; font-src data:; " +
      "connect-src 'none'; form-action 'none'; base-uri 'none'";
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}

// Shim iniettato IN CIMA al documento del quiz. Nessuna dipendenza.
function shimScript(snapshotJson) {
  return `<script>(function(){
  "use strict";
  var TOKEN=${jsEmbed(ORIGIN_TOKEN)};
  var MAX=${MAX_STORAGE_BYTES};
  var parentWin=window.parent;
  function makeStore(seed, kind){
    var map=Object.create(null);
    try{ var s=seed?JSON.parse(seed):{}; for(var k in s){ map[k]=String(s[k]); } }catch(e){}
    function persist(){
      try{
        var j=JSON.stringify(map);
        if(j.length>MAX){ try{console.warn("QuizHub: storage quota superata, salvataggio ignorato");}catch(e){} return; }
        parentWin.postMessage({token:TOKEN,type:"storage",kind:kind,data:JSON.parse(j)},"*");
      }catch(e){}
    }
    var api={
      getItem:function(k){ k=String(k); return Object.prototype.hasOwnProperty.call(map,k)?map[k]:null; },
      setItem:function(k,v){ map[String(k)]=String(v); persist(); },
      removeItem:function(k){ delete map[String(k)]; persist(); },
      clear:function(){ for(var k in map) delete map[k]; persist(); },
      key:function(i){ return Object.keys(map)[i]!=null?Object.keys(map)[i]:null; }
    };
    Object.defineProperty(api,"length",{get:function(){return Object.keys(map).length;}});
    return new Proxy(api,{
      get:function(t,p){ if(p in t) return t[p]; if(typeof p==="string"&&Object.prototype.hasOwnProperty.call(map,p)) return map[p]; return undefined; },
      set:function(t,p,v){ if(p in t){ t[p]=v; return true; } map[String(p)]=String(v); persist(); return true; },
      deleteProperty:function(t,p){ if(Object.prototype.hasOwnProperty.call(map,p)){ delete map[p]; persist(); } return true; },
      has:function(t,p){ return (p in t)||Object.prototype.hasOwnProperty.call(map,p); },
      ownKeys:function(){ return Object.keys(map); },
      getOwnPropertyDescriptor:function(t,p){ if(Object.prototype.hasOwnProperty.call(map,p)) return {enumerable:true,configurable:true,value:map[p]}; return Object.getOwnPropertyDescriptor(t,p); }
    });
  }
  var seedLocal=${"__SEED__"};
  try{ Object.defineProperty(window,"localStorage",{value:makeStore(seedLocal,"local"),configurable:true}); }catch(e){}
  try{ Object.defineProperty(window,"sessionStorage",{value:makeStore("{}","session"),configurable:true}); }catch(e){}
  // Segnala pronto (per timer/telemetria della shell).
  try{ parentWin.postMessage({token:TOKEN,type:"ready"},"*"); }catch(e){}
})();</scr` + `ipt>`.replace("__SEED__", jsEmbed(snapshotJson || "{}"));
}

// Inserisce CSP + shim il più presto possibile nel documento del quiz.
// opts.allowRemote: true = consenti risorse passive esterne (img/font/media).
export function buildSandboxDoc(html, snapshot, opts = {}) {
  const snapJson = JSON.stringify(snapshot || {});
  const inject = cspMeta(!!opts.allowRemote) + shimScript(snapJson);
  const src = String(html || "");

  const headMatch = src.match(/<head[^>]*>/i);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return src.slice(0, at) + inject + src.slice(at);
  }
  const htmlMatch = src.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return src.slice(0, at) + inject + src.slice(at);
  }
  return inject + src;
}

// Valida un messaggio proveniente dal sandbox.
// Richiede: origine opaca ("null"), token corretto, payload entro quota.
export function parseSandboxMessage(ev) {
  if (ev?.origin !== "null") return null; // solo iframe sandbox a origine opaca
  const d = ev?.data;
  if (!d || typeof d !== "object" || d.token !== ORIGIN_TOKEN) return null;
  if (d.type === "storage") {
    if (d.data == null || typeof d.data !== "object") return null;
    try {
      if (JSON.stringify(d.data).length > MAX_STORAGE_BYTES) return null;
    } catch {
      return null;
    }
  }
  return d;
}

// Attributi sandbox: script sì, MA niente allow-same-origin (isolamento
// reale) e niente allow-popups (un window.open verso un sito esterno
// sarebbe un canale di esfiltrazione/phishing).
export const SANDBOX_ATTR = "allow-scripts allow-modals allow-forms allow-downloads";
