"use client";
// ============================================================
//  QuizHub OS — Dashboard di studio (home)
// ------------------------------------------------------------
//  Componente riutilizzabile e disaccoppiato: legge le statistiche
//  di studio da localStorage e comanda il timer globale via
//  CustomEvent "qh:study" (nessun accoppiamento diretto).
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardCheck, Clock3, Play, Repeat2, Star, Target, Timer, Upload } from "lucide-react";
import { loadStudy, fmtDuration } from "@/lib/study";

function studyCmd(detail) {
  try { window.dispatchEvent(new CustomEvent("qh:study", { detail })); } catch {}
}
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buonanotte";
  if (h < 13) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

const SUGGESTIONS = [
  { mode: "pomodoro", icon: Timer, title: "Pomodoro", sub: "25 / 5" },
  { mode: "deepwork", icon: Clock3, title: "Deep Work", sub: "50 / 10" },
  { mode: "exam", icon: ClipboardCheck, title: "Simulazione", sub: "esame" },
  { mode: "chrono", icon: Repeat2, title: "Ripasso", sub: "cronometro" },
];

export default function Dashboard({ spaceName, quizzes = [], stats, foldersCount = 0, onOpen, onUpload }) {
  const [study, setStudy] = useState(null);

  useEffect(() => {
    const read = () => setStudy(loadStudy().stats);
    read();
    const id = setInterval(read, 15000);
    const onVis = () => read();
    window.addEventListener("focus", onVis);
    return () => { clearInterval(id); window.removeEventListener("focus", onVis); };
  }, []);

  const recents = useMemo(
    () => quizzes.filter((x) => x.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 6),
    [quizzes]
  );
  const resume = recents[0] || quizzes[0] || null;
  const favorites = useMemo(() => quizzes.filter((x) => x.favorite).slice(0, 6), [quizzes]);

  return (
    <section className="dash" aria-label="Dashboard di studio">
      <div className="dash-head">
        <div>
          <h1>{greeting()}</h1>
          <p className="sub">Workspace <b>{spaceName}</b> · {stats?.count ?? quizzes.length} file · pronto a studiare?</p>
        </div>
        <div className="dash-actions">
          <button className="btn primary" onClick={onUpload}><Upload /> Importa HTML</button>
        </div>
      </div>

      <div className="dash-grid">
        {/* Continua a studiare */}
        <div className="glasscard continue">
          <div className="cc-label"><Play /> Continua a studiare</div>
          {resume ? (
            <>
              <div className="cc-title">{resume.name}</div>
              <div className="cc-meta">{resume.folder || "senza cartella"}{resume.openCount ? ` · ${resume.openCount}× aperto` : ""}</div>
              <button className="btn primary sm" onClick={() => onOpen(resume.id)}><Play /> Riprendi</button>
            </>
          ) : (
            <>
              <div className="cc-title">Nessun file ancora</div>
              <div className="cc-meta">Importa il tuo primo HTML per iniziare.</div>
              <button className="btn primary sm" onClick={onUpload}><Upload /> Importa</button>
            </>
          )}
        </div>

        {/* Statistiche */}
        <div className="glasscard">
          <div className="cc-label"><BarChart3 /> Oggi</div>
          <div className="dash-stats">
            <div><span className="ds-v">{study ? fmtDuration(study.todaySeconds) : "0m"}</span><span className="ds-k">studio</span></div>
            <div><span className="ds-v">{study?.sessions ?? 0}</span><span className="ds-k">sessioni</span></div>
            <div><span className="ds-v">{study?.streak ?? 0}</span><span className="ds-k">streak</span></div>
            <div><span className="ds-v">{stats?.favorites ?? 0}</span><span className="ds-k">preferiti</span></div>
          </div>
        </div>
      </div>

      {/* Modalità studio / suggerimenti */}
      <div className="cc-label sec"><Timer /> Inizia una sessione</div>
      <div className="suggest-row">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.mode} className="glasscard suggest" onClick={() => studyCmd({ mode: s.mode, start: true })}>
              <span className="sg-ic"><Icon /></span>
              <span className="sg-t">{s.title}</span>
              <span className="sg-s">{s.sub}</span>
            </button>
          );
        })}
        <button className="glasscard suggest focus" onClick={() => studyCmd({ focus: true, open: true })}>
          <span className="sg-ic"><Target /></span>
          <span className="sg-t">Focus</span>
          <span className="sg-s">niente distrazioni</span>
        </button>
      </div>

      {/* Recenti */}
      {recents.length > 0 && (
        <>
          <div className="cc-label sec"><Clock3 /> Recenti</div>
          <div className="recents">
            {recents.map((x) => (
              <button key={x.id} className="rchip" onClick={() => onOpen(x.id)} title={x.name}>
                <span className="rc-name">{x.name}</span>
                <span className="rc-folder">{x.folder || "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Preferiti */}
      {favorites.length > 0 && (
        <>
          <div className="cc-label sec"><Star fill="currentColor" /> Preferiti</div>
          <div className="recents">
            {favorites.map((x) => (
              <button key={x.id} className="rchip fav" onClick={() => onOpen(x.id)} title={x.name}>
                <span className="rc-name">{x.name}</span>
                <span className="rc-folder">{x.folder || "—"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
