// ============================================================
//  QuizHub OS — cifratura locale a riposo (Web Crypto API)
// ------------------------------------------------------------
//  Cifratura opzionale, per-spazio, con passphrase.
//  - Chiave derivata con PBKDF2 (SHA-256, 210k iterazioni)
//  - Contenuti cifrati con AES-GCM 256 (IV casuale per record)
//  La passphrase e la chiave vivono SOLO in memoria (mai su disco).
//  Se dimentichi la passphrase, i dati cifrati non sono recuperabili.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITERATIONS = 210_000;

function subtle() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto non disponibile (serve HTTPS o localhost).");
  }
  return crypto.subtle;
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// Deriva una CryptoKey AES-GCM da passphrase + salt.
export async function deriveKey(passphrase, salt) {
  const baseKey = await subtle().importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Crea i metadati di verifica per uno spazio cifrato: salt + un "canary"
// cifrato che permette di validare la passphrase all'unlock senza esporre dati.
export async function createVault(passphrase) {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const canary = await encryptString(key, "quizhub-os-vault-v1");
  return { salt: b64(salt), canary, algo: "AES-GCM", kdf: "PBKDF2-210k" };
}

// Verifica una passphrase contro i metadati e restituisce la chiave se valida.
export async function unlockVault(passphrase, meta) {
  const key = await deriveKey(passphrase, unb64(meta.salt));
  try {
    const plain = await decryptString(key, meta.canary);
    if (plain !== "quizhub-os-vault-v1") throw new Error("bad");
    return key;
  } catch {
    throw new Error("Passphrase errata.");
  }
}

export async function encryptString(key, plaintext) {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptString(key, payload) {
  const iv = unb64(payload.iv);
  const ct = unb64(payload.ct);
  const pt = await subtle().decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

// Hash SHA-256 esadecimale — usato per fingerprint/integrità dei quiz.
export async function sha256Hex(text) {
  const digest = await subtle().digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
