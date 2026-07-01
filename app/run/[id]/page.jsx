"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getQuiz } from "@/lib/db";

export default function RunPage({ params }) {
  const router = useRouter();
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [quiz, setQuiz] = useState(undefined); // undefined=loading, null=not found
  const [key, setKey] = useState(0); // per ricaricare l'iframe

  useEffect(() => {
    let alive = true;
    getQuiz(params.id)
      .then((qz) => alive && setQuiz(qz))
      .catch(() => alive && setQuiz(null));
    return () => {
      alive = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (quiz && frameRef.current) {
      // Sandbox bilanciata: gli script girano e localStorage persiste
      // (allow-same-origin) così lo storico interno del quiz viene salvato,
      // ma il contenuto resta incapsulato in un iframe.
      frameRef.current.srcdoc = quiz.html;
    }
  }, [quiz, key]);

  function fullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  }

  if (quiz === undefined) {
    return (
      <main className="shell">
        <p className="count">Apro il quiz…</p>
      </main>
    );
  }
  if (quiz === null) {
    return (
      <main className="shell">
        <div className="empty">
          <p className="big">Quiz non trovato</p>
          <p>Forse è stato eliminato o stai usando un altro dispositivo. La libreria è salvata solo su questo device.</p>
          <button className="btn primary" onClick={() => router.push("/")}>
            ← Torna alla libreria
          </button>
        </div>
      </main>
    );
  }

  return (
    <div ref={wrapRef} style={{ background: "#fff", minHeight: "100vh" }}>
      <div className="runbar">
        <button className="btn ghost sm" onClick={() => router.push("/")} aria-label="Indietro">
          ← Libreria
        </button>
        <div className="rtitle">{quiz.name}</div>
        <button className="iconbtn" title="Ricarica" aria-label="Ricarica" onClick={() => setKey((k) => k + 1)}>
          ↻
        </button>
        <button className="iconbtn" title="Schermo intero" aria-label="Schermo intero" onClick={fullscreen}>
          ⤢
        </button>
      </div>
      <iframe
        key={key}
        ref={frameRef}
        className="runframe"
        title={quiz.name}
        sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-downloads"
      />
    </div>
  );
}
