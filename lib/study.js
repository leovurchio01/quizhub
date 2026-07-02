// ============================================================
//  QuizHub OS — motore "Study" (timer globale, metodi, statistiche)
// ------------------------------------------------------------
//  Puro, local-first, zero dipendenze. Persiste su localStorage.
//  Usato dal componente <StudyProvider/> montato nel layout, così
//  il timer vive in tutta l'app e sopravvive ai cambi di pagina.
// ============================================================

export const STUDY_KEY = "qh-study-v1";

// Preset dei metodi di studio (minuti).
export const MODES = {
  pomodoro: { label: "Pomodoro", study: 25, short: 5, long: 15, cycles: 4, kind: "cycle" },
  deepwork: { label: "Deep Work", study: 50, short: 10, long: 20, cycles: 3, kind: "cycle" },
  exam: { label: "Esame", study: 90, short: 0, long: 0, cycles: 1, kind: "countdown" },
  chrono: { label: "Cronometro", study: 0, short: 0, long: 0, cycles: 1, kind: "chrono" },
  custom: { label: "Custom", study: 30, short: 5, long: 15, cycles: 4, kind: "cycle" },
};

export const STRICTNESS = { soft: "Morbido", medium: "Medio", hard: "Forte" };
export const PHASE_LABEL = { idle: "Pronto", study: "Studio", short: "Pausa", long: "Pausa lunga", chrono: "Cronometro", done: "Finito" };

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultState() {
  return {
    mode: "pomodoro",
    prefs: {
      study: 25, short: 5, long: 15, cycles: 4,
      autoStartBreak: true, autoStartStudy: false,
      strictness: "medium", sound: true,
    },
    phase: "idle",      // idle | study | short | long | chrono | done
    running: false,
    endsAt: null,        // ms timestamp (fasi a countdown)
    remaining: null,     // secondi residui quando in pausa
    chronoBase: 0,       // secondi cronometro accumulati (pausa)
    chronoStart: null,   // ms avvio tratto cronometro corrente
    cycle: 0,            // sessioni studio completate nel set
    stats: { date: todayKey(), todaySeconds: 0, sessions: 0, streak: 0, lastActiveDate: null, totalSessions: 0 },
    focus: false,
  };
}

export function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s, prefs: { ...d.prefs, ...(s.prefs || {}) }, stats: { ...d.stats, ...(s.stats || {}) } };
  // Reset contatore giornaliero se è cambiato il giorno.
  if (out.stats.date !== todayKey()) {
    out.stats.date = todayKey();
    out.stats.todaySeconds = 0;
    out.stats.sessions = 0;
  }
  return out;
}

export function loadStudy() {
  if (typeof localStorage === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STUDY_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}
export function saveStudy(s) {
  try { localStorage.setItem(STUDY_KEY, JSON.stringify(s)); } catch {}
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
