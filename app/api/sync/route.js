// ============================================================
//  QuizHub OS — sync cloud opzionale (zero-knowledge)
// ------------------------------------------------------------
//  - Richiede login (next-auth): ogni utente vede SOLO il suo blob.
//  - Storage: Vercel KV / Upstash Redis via REST (nessuna dipendenza).
//    Configurato con KV_REST_API_URL + KV_REST_API_TOKEN.
//  - Il client può cifrare il blob prima dell'upload (spazi vault):
//    il server conserva solo ciphertext opaco.
//  - Se KV non è configurato: 501, l'app resta local-first.
// ============================================================

import { auth } from "@/auth";

export const runtime = "nodejs";
const MAX_BLOB = 8 * 1024 * 1024; // 8 MB per utente

function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kv(command) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${res.status}`);
  return (await res.json()).result;
}

async function userId() {
  const session = await auth();
  const u = session?.user;
  if (!u) return null;
  // sub/email come chiave stabile e non indovinabile lato client.
  return u.id || u.email || null;
}

export async function GET() {
  if (!kvConfigured()) {
    return Response.json({ ok: false, reason: "sync-not-configured" }, { status: 501 });
  }
  const uid = await userId();
  if (!uid) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  try {
    const raw = await kv(["GET", `qh:sync:${uid}`]);
    return Response.json({ ok: true, blob: raw ? JSON.parse(raw) : null });
  } catch (e) {
    return Response.json({ ok: false, reason: "kv-error" }, { status: 502 });
  }
}

export async function PUT(req) {
  if (!kvConfigured()) {
    return Response.json({ ok: false, reason: "sync-not-configured" }, { status: 501 });
  }
  const uid = await userId();
  if (!uid) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "bad-json" }, { status: 400 });
  }
  const serialized = JSON.stringify(body?.blob ?? null);
  if (serialized.length > MAX_BLOB) {
    return Response.json({ ok: false, reason: "too-large" }, { status: 413 });
  }
  try {
    await kv(["SET", `qh:sync:${uid}`, serialized]);
    return Response.json({ ok: true, savedAt: Date.now() });
  } catch {
    return Response.json({ ok: false, reason: "kv-error" }, { status: 502 });
  }
}
