// ============================================================
//  QuizHub OS — archivio locale (IndexedDB, zero dipendenze)
// ------------------------------------------------------------
//  Local-first: i quiz e i loro progressi vivono nel browser.
//  Modello multi-spazio: ogni utente/profilo ha il suo spazio
//  isolato. Cifratura trasparente per gli spazi "vault".
//
//  Store:
//   - spaces   : profili/spazi           (keyPath id)
//   - quizzes  : metadati + html quiz     (keyPath id, index spaceId)
//   - storage  : snapshot storage sandbox (keyPath id = quizId)
//   - meta     : impostazioni app         (keyPath k)
// ============================================================

import { encryptString, decryptString, sha256Hex } from "./crypto";

const DB_NAME = "pss-quiz-hub";
const DB_VERSION = 2;
const S_QUIZ = "quizzes";
const S_SPACE = "spaces";
const S_STORAGE = "storage";
const S_META = "meta";

export const LOCAL_SPACE_ID = "local";

// Chiavi vault sbloccate in memoria (mai persistite).
const vaultKeys = new Map();
export function setVaultKey(spaceId, key) { vaultKeys.set(spaceId, key); }
export function clearVaultKey(spaceId) { vaultKeys.delete(spaceId); }
export function hasVaultKey(spaceId) { return vaultKeys.has(spaceId); }
function keyFor(spaceId) { return vaultKeys.get(spaceId) || null; }

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile in questo browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const txu = req.transaction;

      if (!db.objectStoreNames.contains(S_QUIZ)) {
        const os = db.createObjectStore(S_QUIZ, { keyPath: "id" });
        os.createIndex("updatedAt", "updatedAt");
        os.createIndex("folder", "folder");
        os.createIndex("spaceId", "spaceId");
      } else if (event.oldVersion < 2) {
        const os = txu.objectStore(S_QUIZ);
        if (!os.indexNames.contains("spaceId")) os.createIndex("spaceId", "spaceId");
      }

      if (!db.objectStoreNames.contains(S_SPACE)) {
        db.createObjectStore(S_SPACE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(S_STORAGE)) {
        db.createObjectStore(S_STORAGE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(S_META)) {
        db.createObjectStore(S_META, { keyPath: "k" });
      }

      // Migrazione v1 -> v2: crea lo spazio locale e riassegna i quiz orfani.
      if (event.oldVersion < 2) {
        const spaces = txu.objectStore(S_SPACE);
        spaces.put({
          id: LOCAL_SPACE_ID,
          name: "Spazio locale",
          color: "#3a5bd9",
          owner: "local",
          vault: null,
          createdAt: Date.now(),
        });
        const quizzes = txu.objectStore(S_QUIZ);
        quizzes.openCursor().onsuccess = (e) => {
          const cur = e.target.result;
          if (!cur) return;
          const v = cur.value;
          if (!v.spaceId) {
            v.spaceId = LOCAL_SPACE_ID;
            if (!Array.isArray(v.tags)) v.tags = [];
            cur.update(v);
          }
          cur.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------------- notifica cambiamenti ---------------- */
// Il Guardian (lib/guardian.js) si iscrive qui per replicare i dati
// dopo OGNI scrittura, senza che il resto del codice debba saperlo.
const changeListeners = new Set();
export function onDbChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
function emitChange(store) {
  for (const fn of changeListeners) {
    try { fn(store); } catch {}
  }
}

function run(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);
        let out;
        Promise.resolve(fn(os))
          .then((v) => (out = v))
          .catch(reject);
        tx.oncomplete = () => { resolve(out); if (mode === "readwrite") emitChange(store); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}
function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- meta / impostazioni ---------------- */
export async function getMeta(k, fallback = null) {
  const row = await run(S_META, "readonly", (os) => reqP(os.get(k)));
  return row ? row.v : fallback;
}
export async function setMeta(k, v) {
  return run(S_META, "readwrite", (os) => reqP(os.put({ k, v })));
}

/* ---------------- spazi ---------------- */
export async function listSpaces() {
  const rows = await run(S_SPACE, "readonly", (os) => reqP(os.getAll()));
  if (!rows.length) {
    const local = {
      id: LOCAL_SPACE_ID,
      name: "Spazio locale",
      color: "#3a5bd9",
      owner: "local",
      vault: null,
      createdAt: Date.now(),
    };
    await run(S_SPACE, "readwrite", (os) => reqP(os.put(local)));
    return [local];
  }
  return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
export async function getSpace(id) {
  return run(S_SPACE, "readonly", (os) => reqP(os.get(id)));
}
export async function putSpace(space) {
  return run(S_SPACE, "readwrite", (os) => reqP(os.put(space)));
}
export async function createSpace({ name, color = "#8b5cf6", owner = "local", vault = null }) {
  const space = {
    id: "s_" + uid(),
    name: name?.trim() || "Nuovo spazio",
    color,
    owner,
    vault, // meta del vault (salt/canary) oppure null
    createdAt: Date.now(),
  };
  await putSpace(space);
  return space;
}
export async function deleteSpace(id) {
  if (id === LOCAL_SPACE_ID) throw new Error("Lo spazio locale non è eliminabile.");
  const rows = await rawList(id); // include il cestino
  for (const r of rows) await purgeQuiz(r.id);
  clearVaultKey(id);
  await setMeta("folders:" + id, []);
  return run(S_SPACE, "readwrite", (os) => reqP(os.delete(id)));
}

// Rinomina / ricolora uno spazio.
export async function updateSpace(id, patch) {
  const cur = await getSpace(id);
  if (!cur) throw new Error("Spazio non trovato.");
  const next = { ...cur, ...patch };
  await putSpace(next);
  return next;
}

/* ---------------- quiz ---------------- */
// Righe grezze di uno spazio (incluse quelle nel cestino).
async function rawList(spaceId) {
  const rows = await run(S_QUIZ, "readonly", (os) => {
    if (spaceId && os.indexNames.contains("spaceId")) {
      return reqP(os.index("spaceId").getAll(spaceId));
    }
    return reqP(os.getAll());
  });
  return spaceId ? rows.filter((r) => r.spaceId === spaceId) : rows;
}

function toMeta({ html, ...meta }) {
  return { ...meta, encrypted: !!meta.enc };
}

// Quiz attivi (NON nel cestino).
export async function listQuizzes(spaceId) {
  const rows = await rawList(spaceId);
  return rows
    .filter((r) => !r.deletedAt)
    .map(toMeta)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// Quiz nel cestino.
export async function listTrash(spaceId) {
  const rows = await rawList(spaceId);
  return rows
    .filter((r) => r.deletedAt)
    .map(toMeta)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
}

export async function getQuiz(id) {
  const row = await run(S_QUIZ, "readonly", (os) => reqP(os.get(id)));
  return row || null;
}

// Restituisce l'HTML in chiaro del quiz, decifrando se lo spazio è un vault.
export async function getQuizHtml(quiz) {
  if (!quiz) return null;
  if (!quiz.enc) return quiz.html;
  const key = keyFor(quiz.spaceId);
  if (!key) throw new Error("Spazio bloccato: sblocca il vault per aprire il quiz.");
  return decryptString(key, quiz.html);
}

export async function putQuiz(quiz) {
  return run(S_QUIZ, "readwrite", (os) => reqP(os.put(quiz)));
}

// Aggiorna solo i metadati (non tocca html/cifratura).
export async function patchQuiz(id, patch) {
  const cur = await getQuiz(id);
  if (!cur) throw new Error("Quiz non trovato.");
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await putQuiz(next);
  const { html, ...meta } = next;
  return { ...meta, encrypted: !!meta.enc };
}

export async function markOpened(id) {
  const cur = await getQuiz(id);
  if (!cur) return;
  cur.lastOpenedAt = Date.now();
  cur.openCount = (cur.openCount || 0) + 1;
  await putQuiz(cur);
}

// Soft-delete: sposta nel cestino (recuperabile). NON perde i dati.
export async function deleteQuiz(id) {
  const cur = await getQuiz(id);
  if (!cur) return;
  cur.deletedAt = Date.now();
  cur.updatedAt = Date.now();
  return putQuiz(cur);
}
export async function restoreQuiz(id) {
  const cur = await getQuiz(id);
  if (!cur) return;
  delete cur.deletedAt;
  cur.updatedAt = Date.now();
  return putQuiz(cur);
}
// Elimina davvero (record + snapshot storage). Irreversibile.
export async function purgeQuiz(id) {
  await run(S_STORAGE, "readwrite", (os) => reqP(os.delete(id)));
  return run(S_QUIZ, "readwrite", (os) => reqP(os.delete(id)));
}
export async function emptyTrash(spaceId) {
  const rows = await rawList(spaceId);
  let n = 0;
  for (const r of rows) if (r.deletedAt) { await purgeQuiz(r.id); n++; }
  return n;
}
export async function trashCount(spaceId) {
  const rows = await rawList(spaceId);
  return rows.filter((r) => r.deletedAt).length;
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Crea un quiz da un File .html dentro lo spazio indicato.
export async function addQuizFromFile(file, spaceId, folder = "") {
  const rawHtml = await file.text();
  const now = Date.now();
  const name = file.name.replace(/\.html?$/i, "") || "Quiz senza titolo";
  const hash = await sha256Hex(rawHtml);

  const space = await getSpace(spaceId);
  let html = rawHtml;
  let enc = false;
  if (space?.vault) {
    const key = keyFor(spaceId);
    if (!key) throw new Error("Spazio bloccato: sblocca il vault per caricare quiz.");
    html = await encryptString(key, rawHtml);
    enc = true;
  }

  const quiz = {
    id: uid(),
    spaceId,
    name,
    html,
    enc,
    hash,
    folder: folder || "",
    note: "",
    tags: [],
    favorite: false,
    size: rawHtml.length,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    openCount: 0,
  };
  await putQuiz(quiz);
  const { html: _h, ...meta } = quiz;
  return { ...meta, encrypted: enc };
}

/* ---------- snapshot storage del sandbox (ponte postMessage) ---------- */
// Il runner isola i quiz senza allow-same-origin: il loro localStorage è
// finto e viene rispecchiato qui, cifrato se lo spazio è un vault.
export async function loadQuizStorage(quiz) {
  const row = await run(S_STORAGE, "readonly", (os) => reqP(os.get(quiz.id)));
  if (!row) return {};
  if (!row.enc) return row.data || {};
  const key = keyFor(quiz.spaceId);
  if (!key) return {};
  try {
    return JSON.parse(await decryptString(key, row.payload));
  } catch {
    return {};
  }
}
export async function saveQuizStorage(quiz, data) {
  const enc = !!quiz.enc;
  let row;
  if (enc) {
    const key = keyFor(quiz.spaceId);
    if (!key) return; // spazio bloccato: non persistiamo
    row = { id: quiz.id, spaceId: quiz.spaceId, enc: true, payload: await encryptString(key, JSON.stringify(data || {})) };
  } else {
    row = { id: quiz.id, spaceId: quiz.spaceId, enc: false, data: data || {} };
  }
  return run(S_STORAGE, "readwrite", (os) => reqP(os.put(row)));
}

/* ---------- statistiche di spazio ---------- */
export async function spaceStats(spaceId) {
  const rows = await listQuizzes(spaceId);
  const totalBytes = rows.reduce((s, q) => s + (q.size || 0), 0);
  const folders = new Set(rows.filter((q) => q.folder).map((q) => q.folder));
  const opened = rows.reduce((s, q) => s + (q.openCount || 0), 0);
  return {
    count: rows.length,
    favorites: rows.filter((q) => q.favorite).length,
    folders: folders.size,
    totalBytes,
    opens: opened,
    lastActivity: rows.reduce((m, q) => Math.max(m, q.lastOpenedAt || q.updatedAt || 0), 0),
  };
}

/* ---------- cartelle annidate (path "A/B/C") ---------- */
// Il campo quiz.folder è un percorso con "/". Le cartelle "vuote" (senza
// quiz) sono persistite in meta per poterle comunque mostrare/gestire.
export function normPath(p) {
  return String(p || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}
export async function getFolders(spaceId) {
  const stored = (await getMeta("folders:" + spaceId, [])) || [];
  return Array.from(new Set(stored.map(normPath).filter(Boolean)));
}
export async function setFolders(spaceId, arr) {
  const clean = Array.from(new Set((arr || []).map(normPath).filter(Boolean))).sort();
  return setMeta("folders:" + spaceId, clean);
}
export async function addFolder(spaceId, path) {
  path = normPath(path);
  if (!path) return;
  const f = await getFolders(spaceId);
  // registra anche i segmenti antenati, così l'albero è completo
  const parts = path.split("/");
  const all = new Set(f);
  let acc = "";
  for (const p of parts) { acc = acc ? acc + "/" + p : p; all.add(acc); }
  return setFolders(spaceId, Array.from(all));
}
export async function renameFolder(spaceId, oldPath, newPath) {
  oldPath = normPath(oldPath);
  newPath = normPath(newPath);
  if (!oldPath || !newPath || oldPath === newPath) return;
  const list = await listQuizzes(spaceId);
  for (const q of list) {
    if (q.folder === oldPath || (q.folder && q.folder.startsWith(oldPath + "/"))) {
      await patchQuiz(q.id, { folder: newPath + q.folder.slice(oldPath.length) });
    }
  }
  const f = await getFolders(spaceId);
  const mapped = f.map((p) => (p === oldPath || p.startsWith(oldPath + "/") ? newPath + p.slice(oldPath.length) : p));
  await setFolders(spaceId, mapped);
}
export async function deleteFolder(spaceId, path) {
  path = normPath(path);
  if (!path) return;
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const list = await listQuizzes(spaceId);
  for (const q of list) {
    if (q.folder === path || (q.folder && q.folder.startsWith(path + "/"))) {
      await patchQuiz(q.id, { folder: parent });
    }
  }
  const f = await getFolders(spaceId);
  await setFolders(spaceId, f.filter((p) => !(p === path || p.startsWith(path + "/"))));
}
// Sposta un quiz in una cartella (path) e registra la cartella.
export async function moveQuizToFolder(spaceId, quizId, path) {
  const folder = normPath(path);
  await patchQuiz(quizId, { folder });
  if (folder) await addFolder(spaceId, folder);
}

/* ---------- export / import (backup portabile) ---------- */
export async function exportSpace(spaceId) {
  const space = await getSpace(spaceId);
  const metas = await listQuizzes(spaceId);
  const quizzes = [];
  for (const m of metas) {
    const full = await getQuiz(m.id);
    const html = await getQuizHtml(full); // in chiaro (richiede vault sbloccato)
    quizzes.push({ ...m, html, enc: false });
  }
  return {
    format: "quizhub-os-export",
    version: 1,
    exportedAt: Date.now(),
    space: { name: space?.name, color: space?.color },
    folders: await getFolders(spaceId),
    quizzes,
  };
}

export async function importIntoSpace(spaceId, payload) {
  if (!payload || payload.format !== "quizhub-os-export") {
    throw new Error("File di backup non valido.");
  }
  const space = await getSpace(spaceId);
  const key = space?.vault ? keyFor(spaceId) : null;
  if (space?.vault && !key) throw new Error("Sblocca il vault prima di importare.");

  let n = 0;
  for (const q of payload.quizzes || []) {
    const now = Date.now();
    const rawHtml = q.html || "";
    const enc = !!space?.vault;
    const record = {
      id: uid(),
      spaceId,
      name: q.name || "Quiz importato",
      html: enc ? await encryptString(key, rawHtml) : rawHtml,
      enc,
      hash: q.hash || (await sha256Hex(rawHtml)),
      folder: q.folder || "",
      note: q.note || "",
      tags: Array.isArray(q.tags) ? q.tags : [],
      favorite: !!q.favorite,
      size: rawHtml.length,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      openCount: 0,
    };
    await putQuiz(record);
    n++;
  }
  if (Array.isArray(payload.folders) && payload.folders.length) {
    const existing = await getFolders(spaceId);
    await setFolders(spaceId, [...existing, ...payload.folders]);
  }
  return n;
}

/* ---------- persistenza sul dispositivo ---------- */
// Chiede al browser di NON sfrattare lo storage (protezione dati locale).
export async function requestPersistence() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
// Stato della persistenza + spazio usato/disponibile.
export async function storageInfo() {
  const out = { supported: false, persisted: false, usage: 0, quota: 0 };
  if (typeof navigator === "undefined" || !navigator.storage) return out;
  out.supported = true;
  try { out.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch {}
  try {
    const e = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    out.usage = e.usage || 0;
    out.quota = e.quota || 0;
  } catch {}
  return out;
}

/* ---------- backup COMPLETO della macchina (tutti gli spazi) ---------- */
// Dump grezzo di tutto il database: spazi (con meta vault), quiz (anche
// cifrati), snapshot storage e impostazioni. È la rete di sicurezza per
// recuperare tutto se il browser viene ripulito o cambi dispositivo.
export async function exportEverything() {
  const [spaces, quizzes, storage, meta] = await Promise.all([
    run(S_SPACE, "readonly", (os) => reqP(os.getAll())),
    run(S_QUIZ, "readonly", (os) => reqP(os.getAll())),
    run(S_STORAGE, "readonly", (os) => reqP(os.getAll())),
    run(S_META, "readonly", (os) => reqP(os.getAll())),
  ]);
  return {
    format: "quizhub-os-full",
    version: 1,
    exportedAt: Date.now(),
    spaces,
    quizzes,
    storage,
    // Le chiavi "guardian:*" contengono handle di file locali: non sono
    // serializzabili in JSON e non hanno senso su un altro dispositivo.
    meta: meta.filter((m) => !String(m.k).startsWith("guardian:")),
  };
}
export async function importEverything(payload) {
  if (!payload || payload.format !== "quizhub-os-full") {
    throw new Error("Backup completo non valido.");
  }
  for (const s of payload.spaces || []) await run(S_SPACE, "readwrite", (os) => reqP(os.put(s)));
  for (const q of payload.quizzes || []) await run(S_QUIZ, "readwrite", (os) => reqP(os.put(q)));
  for (const st of payload.storage || []) await run(S_STORAGE, "readwrite", (os) => reqP(os.put(st)));
  for (const m of payload.meta || []) {
    if (String(m.k).startsWith("guardian:")) continue; // handle locali: mai importarli
    await run(S_META, "readwrite", (os) => reqP(os.put(m)));
  }
  return { spaces: (payload.spaces || []).length, quizzes: (payload.quizzes || []).length };
}
