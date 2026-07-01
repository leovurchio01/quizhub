"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getQuiz,
  getQuizHtml,
  listQuizzes,
  loadQuizStorage,
  saveQuizStorage,
  markOpened,
} from "@/lib/db";
import { buildSandboxDoc, parseSandboxMessage, SANDBOX_ATTR } from "@/lib/sandbox";

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

  // Timer d'esame
  const [examLeft, setExamLeft] = useState(null); // secondi rimanenti o null
  const [examRunning, setExamRunning] = useState(false);

  /* carica un quiz nel viewport */
  const loadQuiz = useCallback(async (id) => {
    setStatus("loading");
    setDoc(null);
    try {
      const quiz = await getQuiz(id);
      if (!quiz) { setStatus("notfound"); return; }
      setActiveQuiz(quiz);
      const html = await getQuizHtml(quiz); // può lanciare se vault bloccato
      const snapshot = await loadQuizStorage(quiz);
      setDoc(buildSandboxDoc(html, snapshot));
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
    const raw = prompt("Durata esame in minuti (vuoto per annullare):", "60");
    if (!raw) return;
    const min = parseInt(raw, 10);
    if (!Number.isFinite(min) || min <= 0) return;
    setExamLeft(min * 60); setExamRunning(true);
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
        <button className="btn subtle sm" onClick={() => router.push("/")}>← Libreria</button>
        <div className="tabs">
          {tabs.map((t) => (
            <div key={t.id} className={"tab" + (t.id === activeTab ? " on" : "")} onClick={() => setActiveTab(t.id)}>
              <span className="t">{t.name}</span>
              <span className="x" onClick={(e) => closeTab(t.id, e)}>✕</span>
            </div>
          ))}
          <button className="iconbtn" title="Apri un altro quiz" onClick={() => setPicker((p) => !p)}>＋</button>
        </div>
        <div className="winbtns">
          <button className="iconbtn" title="Zoom -" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>－</button>
          <button className="iconbtn" title="Zoom +" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>＋</button>
          <button className="iconbtn" title="Ricarica" onClick={() => setReloadKey((k) => k + 1)}>↻</button>
          <button className="iconbtn" title="Timer esame" onClick={setExam}>⏱</button>
          <button className="iconbtn" title="Schermo intero" onClick={fullscreen}>⤢</button>
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
          <button className="iconbtn" title={examRunning ? "Pausa" : "Riprendi"} onClick={() => setExamRunning((r) => !r)}>{examRunning ? "⏸" : "▶"}</button>
          <button className="iconbtn" title="Azzera" onClick={() => { setExamLeft(null); setExamRunning(false); }}>✕</button>
        </div>
      )}
    </div>
  );
}
