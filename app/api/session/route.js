// ============================================================
//  QuizHub OS — sessione via Google Identity Services (GIS)
// ------------------------------------------------------------
//  POST   { credential }  -> verifica l'ID token Google e crea il cookie
//  GET                    -> restituisce l'utente corrente (o null)
//  DELETE                 -> logout (cancella il cookie)
//
//  Verifica dell'ID token tramite l'endpoint ufficiale tokeninfo di
//  Google (server->server): niente client secret, niente callback.
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/jwt";

export const runtime = "nodejs";

const COOKIE = "qh_session";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SECRET = process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET-in-prod";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 giorni

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  };
}

export async function POST(req) {
  if (!CLIENT_ID) return NextResponse.json({ ok: false, reason: "login-not-configured" }, { status: 501 });

  const body = await req.json().catch(() => null);
  const credential = body?.credential;
  if (!credential) return NextResponse.json({ ok: false, reason: "no-credential" }, { status: 400 });

  // Verifica l'ID token contro Google.
  let info;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: false, reason: "invalid-token" }, { status: 401 });
    info = await r.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "verify-failed" }, { status: 502 });
  }

  const issOk = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  const audOk = info.aud === CLIENT_ID;
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!issOk || !audOk || !verified) {
    return NextResponse.json({ ok: false, reason: "token-rejected" }, { status: 401 });
  }

  const user = { id: info.sub, email: info.email, name: info.name || info.email };
  const token = await signSession({ sub: user.id, email: user.email, name: user.name }, SECRET, MAX_AGE);

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(COOKIE, token, cookieOpts());
  return res;
}

export async function GET() {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return NextResponse.json({ user: null });
  const payload = await verifySession(raw, SECRET);
  if (!payload) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { id: payload.sub, email: payload.email, name: payload.name } });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { ...cookieOpts(), maxAge: 0 });
  return res;
}
