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
        tx.oncomplete = () => resolve(out);
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
  const quizzes = await listQuizzes(id);
  for (const q of quizzes) await deleteQuiz(q.id);
  clearVaultKey(id);
  return run(S_SPACE, "readwrite", (os) => reqP(os.delete(id)));
}

/* ---------------- quiz ---------------- */
export async function listQuizzes(spaceId) {
  const rows = await run(S_QUIZ, "readonly", (os) => {
    if (spaceId && os.indexNames.contains("spaceId")) {
      return reqP(os.index("spaceId").getAll(spaceId));
    }
    return reqP(os.getAll());
  });
  const list = spaceId ? rows.filter((r) => r.spaceId === spaceId) : rows;
  // Non restituiamo l'html nel listing (leggero + non tocca la cifratura).
  return list
    .map(({ html, ...meta }) => ({ ...meta, encrypted: !!meta.enc }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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

export async function deleteQuiz(id) {
  await run(S_STORAGE, "readwrite", (os) => reqP(os.delete(id)));
  return run(S_QUIZ, "readwrite", (os) => reqP(os.delete(id)));
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
  return n;
}
