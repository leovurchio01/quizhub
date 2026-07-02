// ============================================================
//  QuizHub OS - motore Study
// ------------------------------------------------------------
//  Timer globale, metodi e statistiche local-first in localStorage.
//  Il modulo resta puro: niente React, niente IndexedDB.
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

export function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayEntry(seconds = 0, sessions = 0) {
  return { seconds: Math.max(0, Math.round(seconds || 0)), sessions: Math.max(0, Math.round(sessions || 0)) };
}

function pruneDays(days, keep = 35) {
  return Object.fromEntries(Object.entries(days || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, keep));
}

function normalizeStats(stats = {}) {
  const date = stats.date || todayKey();
  const days = { ...(stats.days || {}) };
  days[date] = dayEntry(days[date]?.seconds ?? stats.todaySeconds, days[date]?.sessions ?? stats.sessions);
  const bestDaySeconds = Math.max(
    stats.bestDaySeconds || 0,
    ...Object.values(days).map((d) => d?.seconds || 0)
  );
  return {
    date,
    todaySeconds: Math.max(0, Math.round(stats.todaySeconds || 0)),
    sessions: Math.max(0, Math.round(stats.sessions || 0)),
    streak: Math.max(0, Math.round(stats.streak || 0)),
    lastActiveDate: stats.lastActiveDate || null,
    totalSessions: Math.max(0, Math.round(stats.totalSessions || 0)),
    totalSeconds: Math.max(0, Math.round(stats.totalSeconds || 0)),
    bestDaySeconds,
    days: pruneDays(days),
  };
}

export function defaultState() {
  const date = todayKey();
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
    stats: normalizeStats({ date, days: { [date]: dayEntry() } }),
    focus: false,
  };
}

export function rollStatsToToday(stats) {
  const t = todayKey();
  const next = normalizeStats(stats);
  if (next.date === t) return next;
  next.days[next.date] = dayEntry(next.todaySeconds, next.sessions);
  next.date = t;
  next.todaySeconds = 0;
  next.sessions = 0;
  next.days[t] = next.days[t] || dayEntry();
  next.days = pruneDays(next.days);
  return next;
}

export function recordStudySecond(stats) {
  const t = todayKey();
  const next = rollStatsToToday(stats);
  const current = dayEntry(next.days[t]?.seconds, next.days[t]?.sessions);
  current.seconds += 1;
  next.days[t] = current;
  next.todaySeconds += 1;
  next.totalSeconds += 1;
  next.bestDaySeconds = Math.max(next.bestDaySeconds || 0, current.seconds);
  return next;
}

export function recordStudySession(stats) {
  const t = todayKey();
  const next = rollStatsToToday(stats);
  const current = dayEntry(next.days[t]?.seconds, next.days[t]?.sessions);
  current.sessions += 1;
  next.days[t] = current;
  next.sessions += 1;
  next.totalSessions += 1;
  return next;
}

export function migrate(s) {
  const d = defaultState();
  const out = {
    ...d,
    ...s,
    prefs: { ...d.prefs, ...(s?.prefs || {}) },
    stats: normalizeStats({ ...d.stats, ...(s?.stats || {}) }),
  };
  out.stats = rollStatsToToday(out.stats);
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

export function lastStudyDays(stats, count = 7) {
  const s = rollStatsToToday(stats || defaultState().stats);
  return Array.from({ length: count }, (_, i) => {
    const key = todayKey(i - count + 1);
    const value = dayEntry(s.days?.[key]?.seconds, s.days?.[key]?.sessions);
    const d = new Date(`${key}T12:00:00`);
    return {
      key,
      seconds: value.seconds,
      sessions: value.sessions,
      label: d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", ""),
    };
  });
}

export function studySummary(stats) {
  const safe = rollStatsToToday(stats || defaultState().stats);
  const days = lastStudyDays(safe, 7);
  const weekSeconds = days.reduce((sum, d) => sum + d.seconds, 0);
  const weekSessions = days.reduce((sum, d) => sum + d.sessions, 0);
  const activeDays = days.filter((d) => d.seconds > 0).length;
  const avgSessionSeconds = safe.totalSessions ? Math.round((safe.totalSeconds || 0) / safe.totalSessions) : 0;
  const focusScore = Math.min(100, Math.round((activeDays / 7) * 55 + Math.min(45, (weekSeconds / (5 * 3600)) * 45)));
  return {
    days,
    weekSeconds,
    weekSessions,
    activeDays,
    avgSessionSeconds,
    focusScore,
    totalSeconds: safe.totalSeconds || 0,
    totalSessions: safe.totalSessions || 0,
    bestDaySeconds: safe.bestDaySeconds || 0,
  };
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
