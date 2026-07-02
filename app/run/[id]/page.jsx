"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize2, Minus, Pause, Play, Plus, RefreshCw, Timer, X } from "lucide-react";
import {
  getQuiz,
  getQuizHtml,
  listQuizzes,
  loadQuizStorage,
  saveQuizStorage,
  markOpened,
} from "@/lib/db";
import { buildSandboxDoc, parseSandboxMessage, SANDBOX_ATTR } from "@/lib/sandbox";
import { sha256Hex } from "@/lib/crypto";

export default function Runner({ params }) {
  const router = useRouter();
  const frameRef = useRef(null);
  const rootRef = useRef(null);
  const saveTimers = useRef({});

  const [tabs, setTabs] = useState([]); // [{id, name}]
  const [activeTab, setActiveTab] = useState(null); // quizId
  const [doc, setDoc] = useState(null); // srcdoc corrente
  const [status, setStatus] = useState("loading"); // loading|ready|locked|notfound
  const [zoom, setZoom] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [picker, setPicker] = useState(false);
  const [siblings, setSiblings] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [integrity, setIntegrity] = useState(null); // true|false|null (senza hash)

  // Timer d'esame
  const [examLeft, setExamLeft] = useState(null); // secondi rimanenti o null
  const [examRunning, setExamRunning] = useState(false);
  const [showExamDialog, setShowExamDialog] = useState(false);

  /* carica un quiz nel viewport */
  const loadQuiz = useCallback(async (id) => {
    setStatus("loading");
    setDoc(null);
    setIntegrity(null);
    try {
      const quiz = await getQuiz(id);
      if (!quiz) { setStatus("notfound"); return; }
      setActiveQuiz(quiz);
      const html = await getQuizHtml(quiz); // può lanciare se vault bloccato
      // Verifica d'integrità: l'HTML corrisponde ancora al fingerprint
      // registrato al caricamento? (rileva corruzioni o manomissioni)
      if (quiz.hash) {
        sha256Hex(html).then((h) => setIntegrity(h === quiz.hash)).catch(() => setIntegrity(null));
      } else {
        setIntegrity(null);
      }
      const snapshot = await loadQuizStorage(quiz);
      setDoc(buildSandboxDoc(html, snapshot, { allowRemote: !!quiz.net }));
      setStatus("ready");
      markOpened(id).catch(() => {});
      // sibling per il picker
      listQuizzes(quiz.spaceId).then(setSiblings).catch(() => {});
    } catch (e) {
      setStatus(String(e?.message || "").includes("bloccato") ? "locked" : "notfound");
    }
  }, []);

  /* bootstrap prima tab */
  useEffect(() => {
    (async () => {
      const quiz = await getQuiz(params.id);
      if (!quiz) { setStatus("notfound"); return; }
      setTabs([{ id: quiz.id, name: quiz.name }]);
      setActiveTab(quiz.id);
    })().catch(() => setStatus("notfound"));
  }, [params.id]);

  useEffect(() => { if (activeTab) loadQuiz(activeTab); }, [activeTab, loadQuiz, reloadKey]);

  /* ponte storage: salva gli aggiornamenti provenienti dal sandbox */
  useEffect(() => {
    function onMsg(ev) {
      if (frameRef.current && ev.source !== frameRef.current.contentWindow) return;
      const msg = parseSandboxMessage(ev);
      if (!msg || !activeQuiz) return;
      if (msg.type === "storage" && msg.kind === "local") {
        clearTimeout(saveTimers.current[activeQuiz.id]);
        const data = msg.data;
        saveTimers.current[activeQuiz.id] = setTimeout(() => {
          saveQuizStorage(activeQuiz, data).catch(() => {});
        }, 400);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [activeQuiz]);

  /* iniezione srcdoc */
  useEffect(() => {
    if (doc != null && frameRef.current) frameRef.current.srcdoc = doc;
  }, [doc]);

  /* timer d'esame */
  useEffect(() => {
    if (!examRunning || examLeft == null) return;
    if (examLeft <= 0) { setExamRunning(false); return; }
    const id = setInterval(() => setExamLeft((s) => (s != null ? s - 1 : s)), 1000);
    return () => clearInterval(id);
  }, [examRunning, examLeft]);

  function openTab(quiz) {
    setPicker(false);
    setTabs((t) => (t.some((x) => x.id === quiz.id) ? t : [...t, { id: quiz.id, name: quiz.name }]));
    setActiveTab(quiz.id);
  }
  function closeTab(id, e) {
    e?.stopPropagation();
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id);
      if (id === activeTab) {
        if (next.length) setActiveTab(next[next.length - 1].id);
        else router.push("/");
      }
      return next;
    });
  }
  function fullscreen() {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  }
  function setExam() {
    setShowExamDialog(true);
  }
  function confirmExam(minutes) {
    const min = parseInt(minutes, 10);
    if (!Number.isFinite(min) || min <= 0) return;
    setExamLeft(min * 60);
    setExamRunning(true);
    setShowExamDialog(false);
  }
  const examStr = useMemo(() => {
    if (examLeft == null) return null;
    const m = Math.floor(examLeft / 60), s = examLeft % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [examLeft]);
  const examClass = examLeft == null ? "" : examLeft <= 60 ? "crit" : examLeft <= 300 ? "warn" : "";

  return (
    <div className="runner" ref={rootRef}>
      <div className="titlebar">
        <div className="traffic" aria-hidden>
          <i className="r" onClick={() => router.push("/")} style={{ cursor: "pointer" }} title="Chiudi" />
          <i className="y" onClick={() => setZoom(1)} style={{ cursor: "pointer" }} title="Reset zoom" />
          <i className="g" onClick={fullscreen} style={{ cursor: "pointer" }} title="Schermo intero" />
        </div>
        <button className="btn subtle sm" onClick={() => router.push("/")}><ArrowLeft /> Libreria</button>
        <div className="tabs">
          {tabs.map((t) => (
            <div key={t.id} className={"tab" + (t.id === activeTab ? " on" : "")} onClick={() => setActiveTab(t.id)}>
              <span className="t">{t.name}</span>
              <span className="x" onClick={(e) => closeTab(t.id, e)}><X /></span>
            </div>
          ))}
          <button className="iconbtn" title="Apri un altro quiz" aria-label="Apri un altro quiz" onClick={() => setPicker((p) => !p)}><Plus /></button>
        </div>
        <div className="secinfo" aria-hidden>
          <span className="secpill" title="Il quiz gira in un iframe sandbox a origine opaca: non può toccare i tuoi dati.">🔐 isolato</span>
          <span className="secpill" title={activeQuiz?.net
            ? "Questo quiz può caricare immagini/font esterni. Fetch e script esterni restano bloccati."
            : "Rete completamente bloccata: il quiz non può contattare Internet."}>
            {activeQuiz?.net ? "🌐 risorse esterne" : "⛔ offline"}
          </span>
          {integrity === true && <span className="secpill ok" title="L'HTML corrisponde al fingerprint SHA-256 registrato al caricamento.">✓ integro</span>}
          {integrity === false && <span className="secpill warn" title="L'HTML NON corrisponde più al fingerprint originale: file corrotto o modificato.">⚠ modificato</span>}
        </div>
        <div className="winbtns">
          <button className="iconbtn" title="Zoom -" aria-label="Riduci zoom" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Minus /></button>
          <button className="iconbtn" title="Zoom +" aria-label="Aumenta zoom" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}><Plus /></button>
          <button className="iconbtn" title="Ricarica" aria-label="Ricarica quiz" onClick={() => setReloadKey((k) => k + 1)}><RefreshCw /></button>
          <button className="iconbtn" title="Timer esame" aria-label="Imposta timer esame" onClick={setExam}><Timer /></button>
          <button className="iconbtn" title="Schermo intero" aria-label="Schermo intero" onClick={fullscreen}><Maximize2 /></button>
        </div>
      </div>

      {picker && (
        <div className="scrim" onClick={() => setPicker(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Apri in una nuova tab</h3>
            <p className="lead">Quiz dello stesso spazio.</p>
            <div className="pallist" style={{ maxHeight: "50vh" }}>
              {siblings.filter((s) => !tabs.some((t) => t.id === s.id)).map((s) => (
                <div key={s.id} className="palitem" onClick={() => openTab(s)}>
                  <span className="ic">▶</span>
                  <div><div>{s.name}</div><div className="subt">{s.folder || "quiz"}</div></div>
                </div>
              ))}
              {siblings.filter((s) => !tabs.some((t) => t.id === s.id)).length === 0 && (
                <div className="palitem"><span className="subt">Nessun altro quiz in questo spazio.</span></div>
              )}
            </div>
            <div className="row"><button className="btn subtle" onClick={() => setPicker(false)}>Chiudi</button></div>
          </div>
        </div>
      )}

      <div className="viewport">
        {status === "loading" && <div className="center-load"><div className="spinner" /></div>}
        {status === "locked" && (
          <div className="empty">
            <div className="orb">🔒</div>
            <p className="big">Spazio bloccato</p>
            <p>Questo quiz è in uno spazio cifrato. Torna alla libreria e sblocca il vault per aprirlo.</p>
            <button className="btn primary" onClick={() => router.push("/")}>← Torna alla libreria</button>
          </div>
        )}
        {status === "notfound" && (
          <div className="empty">
            <div className="orb">🛰️</div>
            <p className="big">Quiz non trovato</p>
            <p>Forse è stato eliminato o è su un altro dispositivo. La libreria vive su questo device.</p>
            <button className="btn primary" onClick={() => router.push("/")}>← Torna alla libreria</button>
          </div>
        )}
        {status === "ready" && (
          <iframe
            key={activeTab + ":" + reloadKey}
            ref={frameRef}
            className="runframe"
            title={activeQuiz?.name || "Quiz"}
            sandbox={SANDBOX_ATTR}
            style={zoom !== 1 ? { width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})`, transformOrigin: "top left" } : undefined}
          />
        )}
      </div>

      {examStr && (
        <div className="exam-hud">
          <span className={"time " + examClass}>{examStr}</span>
          <button className="iconbtn" title={examRunning ? "Pausa" : "Riprendi"} aria-label={examRunning ? "Pausa timer" : "Riprendi timer"} onClick={() => setExamRunning((r) => !r)}>{examRunning ? <Pause /> : <Play />}</button>
          <button className="iconbtn" title="Azzera" aria-label="Azzera timer" onClick={() => { setExamLeft(null); setExamRunning(false); }}><X /></button>
        </div>
      )}
      {showExamDialog && (
        <ExamTimerDialog onClose={() => setShowExamDialog(false)} onConfirm={confirmExam} />
      )}
    </div>
  );
}

function ExamTimerDialog({ onClose, onConfirm }) {
  const [minutes, setMinutes] = useState("60");
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3>Timer esame</h3>
        <p className="lead">Imposta la durata in minuti per avviare un conto alla rovescia visibile sopra al quiz.</p>
        <div className="field">
          <label>Durata (minuti)</label>
          <input
            autoFocus
            type="number"
            min="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(minutes);
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onConfirm(minutes)}>Avvia timer</button>
        </div>
      </div>
    </div>
  );
}
