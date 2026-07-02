"use client";
// ============================================================
//  QuizHub OS — Study Provider (timer globale + pause + focus)
// ------------------------------------------------------------
//  Montato una sola volta nel layout: vive in TUTTA l'app e
//  sopravvive ai cambi di pagina. Local-first (localStorage),
//  zero dipendenze. Non tocca i dati IndexedDB né la logica quiz.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MODES, STRICTNESS, PHASE_LABEL,
  loadStudy, saveStudy, defaultState, fmtClock, fmtDuration, todayKey,
} from "@/lib/study";

function beep(on) {
  if (!on) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.52);
  } catch {}
}
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
const BREAK = new Set(["short", "long"]);
const COUNTDOWN = new Set(["study", "short", "long"]);

export default function StudyProvider() {
  const pathname = usePathname();
  const [st, setSt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const stRef = useRef(null);
  const cmdRef = useRef(null);

  useEffect(() => { setSt(loadStudy()); }, []);
  useEffect(() => { stRef.current = st; }, [st]);

  // Comandi esterni (dalla Dashboard) via CustomEvent "qh:study".
  useEffect(() => {
    const h = (e) => cmdRef.current && cmdRef.current(e.detail || {});
    window.addEventListener("qh:study", h);
    return () => window.removeEventListener("qh:study", h);
  }, []);

  const update = useCallback((patch) => {
    setSt((s) => {
      const n = typeof patch === "function" ? patch(s) : { ...s, ...patch };
      saveStudy(n);
      return n;
    });
  }, []);

  // applica/rimuove il focus mode a livello documento
  useEffect(() => {
    if (!st) return;
    const d = document.documentElement;
    st.focus ? d.setAttribute("data-focus", "1") : d.removeAttribute("data-focus");
  }, [st?.focus]);

  // motore: un solo intervallo per tutta la vita del componente
  useEffect(() => {
    const id = setInterval(() => {
      const s = stRef.current;
      setNow(Date.now());
      if (!s || !s.running) return;
      const t = Date.now();
      let n = { ...s, stats: { ...s.stats } };
      let changed = false;

      if (n.stats.date !== todayKey()) {
        n.stats.date = todayKey(); n.stats.todaySeconds = 0; n.stats.sessions = 0; changed = true;
      }
      const studying = n.phase === "study" || n.phase === "chrono";
      if (studying) {
        if (n.stats.todaySeconds === 0) {
          // primo secondo di studio oggi: aggiorna lo streak
          n.stats.streak = n.stats.lastActiveDate === yesterdayKey() ? (n.stats.streak || 0) + 1 : 1;
          n.stats.lastActiveDate = todayKey();
        }
        n.stats.todaySeconds += 1; changed = true;
      }
      if (COUNTDOWN.has(n.phase) && n.endsAt && t >= n.endsAt) {
        n = advance(n); beep(n.prefs.sound); changed = true;
      }
      if (changed) update(() => n);
    }, 1000);
    return () => clearInterval(id);
  }, [update]);

  /* -------- transizioni di fase -------- */
  function advance(n) {
    const p = n.prefs;
    if (n.phase === "study") {
      const cycle = n.cycle + 1;
      const sessions = (n.stats.sessions || 0) + 1;
      const totalSessions = (n.stats.totalSessions || 0) + 1;
      const stats = { ...n.stats, sessions, totalSessions };
      if (n.mode === "exam") return { ...n, phase: "done", running: false, endsAt: null, remaining: null, cycle, stats };
      const isLong = cycle % (p.cycles || 4) === 0;
      const mins = isLong ? p.long : p.short;
      if (!mins) return startStudy({ ...n, cycle, stats }, p.autoStartStudy);
      return { ...n, phase: isLong ? "long" : "short", cycle, stats,
        endsAt: p.autoStartBreak ? Date.now() + mins * 60000 : null,
        remaining: mins * 60, running: !!p.autoStartBreak };
    }
    // pausa finita -> studio
    return startStudy(n, p.autoStartStudy);
  }
  function startStudy(n, run) {
    const secs = (n.prefs.study || 25) * 60;
    return { ...n, phase: "study",
      endsAt: run ? Date.now() + secs * 1000 : null, remaining: secs, running: !!run };
  }

  /* -------- controlli -------- */
  const derived = useMemo(() => {
    if (!st) return { seconds: 0, total: 0, label: "" };
    if (st.phase === "chrono") {
      const extra = st.running && st.chronoStart ? Math.round((now - st.chronoStart) / 1000) : 0;
      return { seconds: (st.chronoBase || 0) + extra, total: 0, label: PHASE_LABEL.chrono, up: true };
    }
    if (COUNTDOWN.has(st.phase)) {
      const total = (st.phase === "study" ? st.prefs.study : st.phase === "long" ? st.prefs.long : st.prefs.short) * 60;
      const rem = st.running && st.endsAt ? Math.max(0, Math.round((st.endsAt - now) / 1000)) : (st.remaining ?? total);
      return { seconds: rem, total, label: PHASE_LABEL[st.phase] };
    }
    return { seconds: 0, total: 0, label: PHASE_LABEL[st.phase] || "" };
  }, [st, now]);

  function begin() {
    const mode = MODES[st.mode];
    if (mode.kind === "chrono") { update({ phase: "chrono", running: true, chronoBase: 0, chronoStart: Date.now(), cycle: 0 }); return; }
    update((s) => startStudy({ ...s, cycle: 0 }, true));
  }
  function toggleRun() {
    if (!st) return;
    if (!st.running) {
      if (st.phase === "idle" || st.phase === "done") return begin();
      if (st.phase === "chrono") return update({ running: true, chronoStart: Date.now() });
      const rem = st.remaining ?? derived.seconds;
      return update({ running: true, endsAt: Date.now() + rem * 1000 });
    }
    // pausa
    if (st.phase === "chrono") {
      const extra = st.chronoStart ? Math.round((Date.now() - st.chronoStart) / 1000) : 0;
      return update({ running: false, chronoBase: (st.chronoBase || 0) + extra, chronoStart: null });
    }
    update({ running: false, remaining: derived.seconds, endsAt: null });
  }
  function reset() { update({ ...defaultState(), mode: st.mode, prefs: st.prefs, stats: st.stats, focus: st.focus }); }
  function skip() { if (!st) return; if (st.phase === "chrono" || st.phase === "idle" || st.phase === "done") return; update((s) => advance(s)); }
  function endBreakNow() { update((s) => startStudy(s, true)); }
  function selectMode(mode) {
    const p = MODES[mode];
    const prefs = mode === "custom" ? st.prefs : { ...st.prefs, study: p.study, short: p.short, long: p.long, cycles: p.cycles };
    update({ mode, prefs, phase: "idle", running: false, endsAt: null, remaining: null, chronoBase: 0, chronoStart: null, cycle: 0 });
  }
  function setPref(k, v) { update((s) => ({ ...s, prefs: { ...s.prefs, [k]: v } })); }
  function startSession(mode) {
    const p = MODES[mode] || MODES.pomodoro;
    update((s) => {
      const prefs = mode === "custom" ? s.prefs : { ...s.prefs, study: p.study, short: p.short, long: p.long, cycles: p.cycles };
      if (p.kind === "chrono") return { ...s, mode, prefs, phase: "chrono", running: true, chronoBase: 0, chronoStart: Date.now(), cycle: 0 };
      const secs = (prefs.study || 25) * 60;
      return { ...s, mode, prefs, phase: "study", running: true, endsAt: Date.now() + secs * 1000, remaining: secs, cycle: 0 };
    });
  }

  // Handler dei comandi esterni (assegnato ad ogni render → sempre aggiornato).
  cmdRef.current = (d) => {
    if (!d || !stRef.current) return;
    if (d.open) setOpen(true);
    if (d.focus != null) update({ focus: !!d.focus });
    if (d.mode && d.start) { startSession(d.mode); setOpen(true); }
    else if (d.mode) { selectMode(d.mode); setOpen(true); }
  };

  if (!st || pathname === "/login") return null;

  const phaseClass = st.phase === "study" || st.phase === "chrono" ? "run"
    : BREAK.has(st.phase) ? "brk" : st.phase === "done" ? "done" : "idle";
  const warn = COUNTDOWN.has(st.phase) && st.running && derived.total && derived.seconds <= Math.max(30, derived.total * 0.1);
  const inBreak = BREAK.has(st.phase) && st.running;

  return (
    <>
      {/* widget flottante */}
      <div className={"study-widget " + phaseClass + (open ? " open" : "")} role="region" aria-label="Timer di studio">
        {!open ? (
          <button className="study-fab" onClick={() => setOpen(true)} title="Timer di studio"
            aria-label={`Timer di studio: ${derived.label} ${fmtClock(derived.seconds)}`}>
            <span className="sf-time">{fmtClock(derived.seconds)}</span>
            <span className="sf-dot" />
          </button>
        ) : (
          <div className="study-panel">
            <div className="sp-head">
              <span className="sp-label">{derived.label}{st.mode ? ` · ${MODES[st.mode].label}` : ""}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="iconbtn sm2" title={st.focus ? "Esci da Focus" : "Modalità Focus"} aria-pressed={st.focus}
                  onClick={() => update({ focus: !st.focus })}>{st.focus ? "◉" : "○"}</button>
                <button className="iconbtn sm2" title="Impostazioni studio" onClick={() => setShowSettings(true)}>⚙︎</button>
                <button className="iconbtn sm2" title="Riduci" onClick={() => setOpen(false)}>▾</button>
              </div>
            </div>

            <div className="sp-time" aria-live="polite">
              <span className={"spt " + (warn ? "warn" : "")}>{fmtClock(derived.seconds)}</span>
              {derived.total > 0 && (
                <div className="sp-bar"><i style={{ width: `${Math.max(2, (derived.seconds / derived.total) * 100)}%` }} /></div>
              )}
            </div>

            <div className="sp-modes">
              {Object.entries(MODES).map(([id, m]) => (
                <button key={id} className={"chip xs" + (st.mode === id ? " on" : "")} onClick={() => selectMode(id)}>{m.label}</button>
              ))}
            </div>

            <div className="sp-ctrl">
              <button className="btn primary sm" onClick={toggleRun}>
                {st.running ? "⏸ Pausa" : (st.phase === "idle" || st.phase === "done") ? "▶ Avvia" : "▶ Riprendi"}
              </button>
              {st.mode !== "chrono" && st.mode !== "exam" && <button className="btn subtle sm" title="Salta fase" onClick={skip}>⏭</button>}
              <button className="btn subtle sm" title="Azzera" onClick={reset}>↺</button>
            </div>

            <div className="sp-stats">
              <span title="Tempo di studio oggi">📚 {fmtDuration(st.stats.todaySeconds)}</span>
              <span title="Sessioni completate oggi">✓ {st.stats.sessions}</span>
              <span title="Giorni di fila">🔥 {st.stats.streak}</span>
            </div>
          </div>
        )}
      </div>

      {/* overlay pausa (study break) */}
      {inBreak && (
        <BreakOverlay
          seconds={derived.seconds}
          strictness={st.prefs.strictness}
          onEnd={endBreakNow}
        />
      )}

      {/* impostazioni studio */}
      {showSettings && (
        <StudySettings st={st} onSet={setPref} onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}

/* ============================================================ */
function BreakOverlay({ seconds, strictness, onEnd }) {
  const [holdPct, setHoldPct] = useState(0);
  const raf = useRef(0);
  const holdStart = useRef(0);

  function softEnd() { onEnd(); }
  function mediumEnd() { if (confirm("Vuoi davvero tornare a studiare prima della fine della pausa?")) onEnd(); }

  function startHold() {
    holdStart.current = Date.now();
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - holdStart.current) / 3000) * 100);
      setHoldPct(pct);
      if (pct >= 100) { cancelAnimationFrame(raf.current); onEnd(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }
  function endHold() { cancelAnimationFrame(raf.current); setHoldPct(0); }

  return (
    <div className="break-overlay" role="dialog" aria-modal="true" aria-label="Pausa attiva">
      <div className="break-card">
        <div className="break-emoji" aria-hidden>🌿</div>
        <h2>Pausa attiva</h2>
        <p>Stacca gli occhi dallo schermo, alzati, respira. La pausa è parte dello studio.</p>
        <div className="break-time">{fmtClock(seconds)}</div>
        <p className="break-copy">Niente quiz, niente dashboard. Puoi tornare prima, ma fallo consapevolmente.</p>

        {strictness === "soft" && (
          <button className="btn ghost" onClick={softEnd}>Termina pausa</button>
        )}
        {strictness === "medium" && (
          <button className="btn ghost" onClick={mediumEnd}>Torna a studiare…</button>
        )}
        {strictness === "hard" && (
          <button className="btn ghost hold" onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold}
            onTouchStart={startHold} onTouchEnd={endHold}>
            <span className="hold-fill" style={{ width: `${holdPct}%` }} />
            <span className="hold-label">Tieni premuto per riprendere</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
function StudySettings({ st, onSet, onClose }) {
  const p = st.prefs;
  const numField = (k, label, min = 0, max = 240) => (
    <div className="field">
      <label>{label}</label>
      <input type="number" min={min} max={max} value={p[k]}
        onChange={(e) => onSet(k, Math.max(min, Math.min(max, parseInt(e.target.value || "0", 10))))} />
    </div>
  );
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3>⏱ Metodo di studio</h3>
        <p className="lead">Configura durate e pause. Le impostazioni restano su questo dispositivo.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {numField("study", "Studio (min)", 1)}
          {numField("short", "Pausa breve (min)")}
          {numField("long", "Pausa lunga (min)")}
          {numField("cycles", "Cicli prima della pausa lunga", 1, 12)}
        </div>

        <div className="field">
          <label>Rigidità della pausa</label>
          <div className="opt-row">
            {Object.entries(STRICTNESS).map(([id, label]) => (
              <button key={id} className={"opt" + (p.strictness === id ? " on" : "")} onClick={() => onSet("strictness", id)}>{label}</button>
            ))}
          </div>
        </div>

        <label className="tgl"><input type="checkbox" checked={!!p.autoStartBreak} onChange={(e) => onSet("autoStartBreak", e.target.checked)} /> Avvia le pause automaticamente</label>
        <label className="tgl"><input type="checkbox" checked={!!p.autoStartStudy} onChange={(e) => onSet("autoStartStudy", e.target.checked)} /> Riprendi lo studio automaticamente dopo la pausa</label>
        <label className="tgl"><input type="checkbox" checked={!!p.sound} onChange={(e) => onSet("sound", e.target.checked)} /> Suono a fine fase</label>

        <div className="row"><button className="btn primary" onClick={onClose}>Fatto</button></div>
      </div>
    </div>
  );
}
