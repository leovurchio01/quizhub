// ============================================================
//  QuizHub OS — bridge di sicurezza per il runner
// ------------------------------------------------------------
//  I quiz sono HTML NON attendibili. Girano in un iframe con
//  sandbox="allow-scripts" (SENZA allow-same-origin): origine
//  opaca, quindi NON possono leggere sessione, cookie, storage
//  o IndexedDB della shell, né chiamare le API dell'app.
//
//  Problema: senza allow-same-origin il loro localStorage lancia
//  un SecurityError e i progressi andrebbero persi.
//  Soluzione: iniettiamo uno shim che espone un localStorage/
//  sessionStorage finti, inizializzati da uno snapshot passato
//  dalla shell, e che rispecchia ogni scrittura al parent via
//  postMessage. La shell li salva (cifrati, se vault) in IndexedDB.
// ============================================================

const ORIGIN_TOKEN = "quizhub-os";

// Shim iniettato IN CIMA al documento del quiz. Nessuna dipendenza.
function shimScript(snapshotJson) {
  return `<script>(function(){
  "use strict";
  var TOKEN=${JSON.stringify(ORIGIN_TOKEN)};
  var parentWin=window.parent;
  function makeStore(seed, kind){
    var map=Object.create(null);
    try{ var s=seed?JSON.parse(seed):{}; for(var k in s){ map[k]=String(s[k]); } }catch(e){}
    function persist(){
      try{ parentWin.postMessage({token:TOKEN,type:"storage",kind:kind,data:JSON.parse(JSON.stringify(map))},"*"); }catch(e){}
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
  var seedLocal=${JSON.stringify(snapshotJson || "{}")};
  try{ Object.defineProperty(window,"localStorage",{value:makeStore(seedLocal,"local"),configurable:true}); }catch(e){}
  try{ Object.defineProperty(window,"sessionStorage",{value:makeStore("{}","session"),configurable:true}); }catch(e){}
  // Segnala pronto (per timer/telemetria della shell).
  try{ parentWin.postMessage({token:TOKEN,type:"ready"},"*"); }catch(e){}
})();</scr`+`ipt>`;
}

// Inserisce lo shim il più presto possibile nel documento del quiz.
export function buildSandboxDoc(html, snapshot) {
  const snapJson = JSON.stringify(snapshot || {});
  const shim = shimScript(snapJson);
  const src = String(html || "");

  const headMatch = src.match(/<head[^>]*>/i);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return src.slice(0, at) + shim + src.slice(at);
  }
  const htmlMatch = src.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return src.slice(0, at) + shim + src.slice(at);
  }
  return shim + src;
}

// Valida un messaggio proveniente dal sandbox.
export function parseSandboxMessage(ev) {
  const d = ev?.data;
  if (!d || typeof d !== "object" || d.token !== ORIGIN_TOKEN) return null;
  return d;
}

// Attributi sandbox: script sì, MA niente allow-same-origin (isolamento reale).
// Niente allow-popups-to-escape-sandbox: eventuali popup restano confinati.
export const SANDBOX_ATTR =
  "allow-scripts allow-modals allow-popups allow-forms allow-downloads";
