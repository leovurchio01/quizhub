// ============================================================
//  QuizHub OS — Guardian: persistenza a ridondanza multipla
// ------------------------------------------------------------
//  IndexedDB da solo non basta: i browser possono "sfrattare" lo
//  storage di un'origine sotto pressione, e "Cancella dati di
//  navigazione" azzera tutto. Il Guardian replica automaticamente
//  l'intero database su più livelli indipendenti:
//
//   L1  IndexedDB            — il database vivo (lib/db.js)
//   L2  Replica OPFS         — copia integrale nell'Origin Private
//       File System, con doppio slot A/B alternato + checksum
//       SHA-256: se una scrittura si corrompe (crash, chiusura),
//       l'altro slot resta valido. Auto-riparazione al boot: se il
//       DB è vuoto ma esiste una replica, si propone il ripristino.
//   L3  Cartella sul disco   — con la File System Access API
//       l'utente collega UNA VOLTA una vera cartella del suo PC;
//       da lì in poi ogni modifica scrive quizhub-auto-backup.json
//       (+ una copia datata al giorno, tenute le ultime 7).
//       QUESTA copia vive FUORI dal browser: sopravvive a
//       "cancella dati", reinstallazioni, sfratti. È il livello
//       che "funziona davvero".
//   L4  Cloud (lib/sync.js)  — opzionale, zero-knowledge.
//
//  Zero-knowledge: le repliche contengono i record così come sono
//  in IndexedDB, quindi i quiz dei vault restano CIFRATI anche
//  nelle copie su disco.
//
//  Nessuna scrittura del Guardian tocca IndexedDB (tranne il
//  salvataggio dell'handle della cartella, una tantum): niente
//  loop di notifiche.
// ============================================================

import { exportEverything, importEverything, getMeta, setMeta, onDbChange } from "./db";
import { sha256Hex } from "./crypto";

const REPLICA_SLOTS = ["guardian-replica-a.json", "guardian-replica-b.json"];
const FOLDER_META = "guardian:folder";
const DEBOUNCE_MS = 2500;
const DAILY_KEEP = 7;
const AUTO_BACKUP_NAME = "quizhub-auto-backup.json";

let started = false;
let timer = null;
let saving = false;
let pendingAgain = false;
let paused = false; // durante un ripristino non replichiamo
let bootReplica = null; // migliore replica trovata all'avvio

const state = {
  opfs: { supported: false, lastSavedAt: null, generation: 0, bytes: 0, error: null },
  folder: { supported: false, connected: false, name: null, permission: null, lastSavedAt: null, error: null },
};

const listeners = new Set();
export function onGuardianChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getGuardianState() {
  return { opfs: { ...state.opfs }, folder: { ...state.folder } };
}
function emit() {
  const snap = getGuardianState();
  for (const fn of listeners) {
    try { fn(snap); } catch {}
  }
}

/* ---------------- capacità del browser ---------------- */
function opfsSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage?.getDirectory &&
    typeof FileSystemFileHandle !== "undefined" &&
    !!FileSystemFileHandle.prototype.createWritable // Safari: solo nei worker → livello non attivo
  );
}
function folderSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/* ---------------- L2: replica OPFS (slot A/B) ---------------- */
async function readSlot(root, name) {
  try {
    const fh = await root.getFileHandle(name);
    const text = await (await fh.getFile()).text();
    const obj = JSON.parse(text);
    if (!obj || obj.format !== "quizhub-guardian" || !obj.data) return null;
    const sum = await sha256Hex(JSON.stringify(obj.data));
    if (sum !== obj.sha256) return null; // slot corrotto: lo ignoriamo
    return obj;
  } catch {
    return null;
  }
}

async function readBestReplica() {
  if (!opfsSupported()) return null;
  const root = await navigator.storage.getDirectory();
  const [a, b] = await Promise.all([readSlot(root, REPLICA_SLOTS[0]), readSlot(root, REPLICA_SLOTS[1])]);
  if (a && b) return a.generation >= b.generation ? a : b;
  return a || b;
}

async function writeReplica(dataJson, sha, counts) {
  const root = await navigator.storage.getDirectory();
  const gen = (state.opfs.generation || 0) + 1;
  const slot = REPLICA_SLOTS[gen % 2]; // alterna: l'altro slot resta intatto
  const payload =
    `{"format":"quizhub-guardian","version":1,"generation":${gen},"savedAt":${Date.now()},` +
    `"sha256":"${sha}","counts":${JSON.stringify(counts)},"data":${dataJson}}`;
  const fh = await root.getFileHandle(slot, { create: true });
  const w = await fh.createWritable();
  await w.write(payload);
  await w.close();
  state.opfs.generation = gen;
  state.opfs.lastSavedAt = Date.now();
  state.opfs.bytes = payload.length;
  state.opfs.error = null;
}

/* ---------------- L3: cartella reale sul disco ---------------- */
export async function connectBackupFolder() {
  if (!folderSupported()) {
    throw new Error("Questo browser non supporta le cartelle locali: usa Chrome o Edge, oppure scarica il backup manuale.");
  }
  const handle = await window.showDirectoryPicker({ id: "quizhub-backup", mode: "readwrite" });
  await setMeta(FOLDER_META, handle); // gli handle sono structured-cloneable: IDB li persiste
  state.folder.connected = true;
  state.folder.name = handle.name;
  state.folder.permission = "granted";
  state.folder.error = null;
  emit();
  schedule(0); // primo backup immediato
  return handle.name;
}

export async function disconnectBackupFolder() {
  await setMeta(FOLDER_META, null);
  state.folder.connected = false;
  state.folder.name = null;
  state.folder.permission = null;
  state.folder.lastSavedAt = null;
  emit();
}

// Dopo un riavvio il permesso torna "prompt": va riattivato con un
// click dell'utente (requestPermission richiede un user gesture).
export async function reauthorizeFolder() {
  const handle = await getMeta(FOLDER_META);
  if (!handle) return false;
  let p = "denied";
  try { p = await handle.requestPermission({ mode: "readwrite" }); } catch {}
  state.folder.permission = p;
  emit();
  if (p === "granted") schedule(0);
  return p === "granted";
}

async function writeFolderBackup(dataJson) {
  let handle = null;
  try { handle = await getMeta(FOLDER_META); } catch {}
  state.folder.connected = !!handle;
  state.folder.name = handle?.name || null;
  if (!handle) return;

  let perm = "denied";
  try { perm = await handle.queryPermission({ mode: "readwrite" }); } catch {}
  state.folder.permission = perm;
  if (perm !== "granted") return; // la UI mostrerà "riattiva"

  async function writeFile(name) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(dataJson);
    await w.close();
  }

  await writeFile(AUTO_BACKUP_NAME);

  // Copia generazionale: una per giorno, tenute le ultime DAILY_KEEP.
  const day = new Date().toISOString().slice(0, 10);
  const dailyName = `quizhub-backup-${day}.json`;
  let dailyExists = false;
  try { await handle.getFileHandle(dailyName); dailyExists = true; } catch {}
  if (!dailyExists) {
    await writeFile(dailyName);
    try {
      const daily = [];
      for await (const [name] of handle.entries()) {
        if (/^quizhub-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) daily.push(name);
      }
      daily.sort();
      while (daily.length > DAILY_KEEP) {
        await handle.removeEntry(daily.shift()).catch(() => {});
      }
    } catch {}
  }

  state.folder.lastSavedAt = Date.now();
  state.folder.error = null;
}

/* ---------------- snapshot orchestrato ---------------- */
async function snapshot() {
  if (saving) { pendingAgain = true; return; }
  saving = true;
  try {
    const data = await exportEverything();
    const dataJson = JSON.stringify(data);
    const counts = {
      spaces: (data.spaces || []).length,
      quizzes: (data.quizzes || []).length,
    };

    if (opfsSupported()) {
      try {
        const sha = await sha256Hex(dataJson);
        await writeReplica(dataJson, sha, counts);
      } catch (e) {
        state.opfs.error = String(e?.message || e);
      }
    }

    try {
      await writeFolderBackup(dataJson);
    } catch (e) {
      state.folder.error = String(e?.message || e);
    }

    emit();
  } catch {
    // exportEverything fallita (DB non apribile): riproveremo alla prossima modifica
  } finally {
    saving = false;
    if (pendingAgain) { pendingAgain = false; schedule(); }
  }
}

function schedule(ms = DEBOUNCE_MS) {
  if (paused) return;
  clearTimeout(timer);
  timer = setTimeout(() => { snapshot(); }, ms);
}

// Replica subito (senza attendere il debounce): usata quando la
// pagina sta per essere nascosta/chiusa.
function flushNow() {
  if (paused) return;
  clearTimeout(timer);
  snapshot();
}
export function snapshotNow() { flushNow(); }

/* ---------------- avvio & auto-riparazione ---------------- */
export async function startGuardian() {
  if (started || typeof window === "undefined") return getGuardianState();
  started = true;

  state.opfs.supported = opfsSupported();
  state.folder.supported = folderSupported();

  if (state.opfs.supported) {
    try {
      bootReplica = await readBestReplica();
      if (bootReplica) {
        state.opfs.generation = bootReplica.generation || 0;
        state.opfs.lastSavedAt = bootReplica.savedAt || null;
      }
    } catch {}
  }

  try {
    const handle = await getMeta(FOLDER_META);
    if (handle) {
      state.folder.connected = true;
      state.folder.name = handle.name;
      try { state.folder.permission = await handle.queryPermission({ mode: "readwrite" }); } catch {}
    }
  } catch {}

  onDbChange(() => schedule());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) flushNow();
  });

  emit();
  return getGuardianState();
}

// Il database è vuoto ma esiste una replica con contenuti?
// (caso tipico: il browser ha sfrattato IndexedDB ma l'OPFS è
// sopravvissuto, o l'utente ha ripulito solo parte dei dati)
export async function checkRecovery() {
  if (!bootReplica) return null;
  const repQuizzes = bootReplica.counts?.quizzes ?? (bootReplica.data.quizzes || []).length;
  if (!repQuizzes) return null;
  try {
    const live = await exportEverything();
    if ((live.quizzes || []).length > 0) return null; // il DB sta bene
  } catch {
    return null;
  }
  return {
    quizzes: repQuizzes,
    spaces: bootReplica.counts?.spaces ?? (bootReplica.data.spaces || []).length,
    savedAt: bootReplica.savedAt,
    generation: bootReplica.generation,
  };
}

export async function restoreFromReplica() {
  const rep = bootReplica || (await readBestReplica());
  if (!rep) throw new Error("Nessuna replica disponibile.");
  paused = true;
  try {
    return await importEverything(rep.data);
  } finally {
    paused = false;
    schedule();
  }
}
