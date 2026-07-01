// ============================================================
//  QuizHub OS — client di sincronizzazione cloud (opzionale)
// ------------------------------------------------------------
//  Spinge/recupera un backup dello spazio attivo verso /api/sync.
//  Per gli spazi vault il payload è già cifrato lato client
//  (export -> il chiamante cifra), quindi il server è zero-knowledge.
// ============================================================

import { exportSpace, importIntoSpace, getSpace } from "./db";

export const SYNC_STATES = {
  IDLE: "idle",
  BUSY: "busy",
  OK: "ok",
  OFFLINE: "offline",
  UNCONFIGURED: "unconfigured",
  UNAUTHORIZED: "unauthorized",
  ERROR: "error",
};

async function call(method, body) {
  const res = await fetch("/api/sync", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 501) return { state: SYNC_STATES.UNCONFIGURED };
  if (res.status === 401) return { state: SYNC_STATES.UNAUTHORIZED };
  if (!res.ok) return { state: SYNC_STATES.ERROR };
  return { state: SYNC_STATES.OK, json: await res.json() };
}

// Carica lo spazio attivo nel cloud (richiede vault sbloccato se cifrato).
export async function pushSpace(spaceId) {
  const space = await getSpace(spaceId);
  const payload = await exportSpace(spaceId); // html in chiaro, poi eventualmente cifrato dal browser client
  const blob = {
    encrypted: !!space?.vault,
    updatedAt: Date.now(),
    spaceName: space?.name,
    payload,
  };
  return call("PUT", { blob });
}

// Recupera dal cloud e importa nello spazio indicato.
export async function pullSpace(spaceId) {
  const r = await call("GET");
  if (r.state !== SYNC_STATES.OK) return r;
  const blob = r.json?.blob;
  if (!blob?.payload) return { state: SYNC_STATES.OK, imported: 0 };
  const imported = await importIntoSpace(spaceId, blob.payload);
  return { state: SYNC_STATES.OK, imported };
}
