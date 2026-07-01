// Piccolo wrapper IndexedDB (nessuna libreria esterna).
// Salva i quiz HTML e i loro metadati nel browser del dispositivo.

const DB_NAME = "pss-quiz-hub";
const DB_VERSION = 1;
const STORE = "quizzes";

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile in questo browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("updatedAt", "updatedAt");
        os.createIndex("folder", "folder");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function listQuizzes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getQuiz(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putQuiz(quiz) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").put(quiz);
    req.onsuccess = () => resolve(quiz);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteQuiz(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Crea un record quiz a partire da un File .html
export async function addQuizFromFile(file, folder = "") {
  const html = await file.text();
  const now = Date.now();
  const name = file.name.replace(/\.html?$/i, "");
  const quiz = {
    id: uid(),
    name: name || "Quiz senza titolo",
    html,
    folder: folder || "",
    note: "",
    favorite: false,
    size: html.length,
    createdAt: now,
    updatedAt: now,
  };
  await putQuiz(quiz);
  return quiz;
}
