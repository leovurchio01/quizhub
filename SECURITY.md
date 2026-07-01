# Security Policy & Threat Model — QuizHub OS

> QuizHub OS **executes arbitrary, user‑supplied HTML**. Security is not a
> side‑feature: it's the central requirement. This document describes the threat
> model, the controls in place, and how to report vulnerabilities.

---

## 1. Surface & actors

| Actor | Trust | Notes |
|---|---|---|
| Owner (the user) | high | Uploads and runs their own quizzes |
| **Quiz content (HTML+JS)** | **none** | Treated as hostile code |
| Server / cloud sync | low (honest‑but‑curious) | Must only ever hold ciphertext |
| Other users | none | No data is shared without an explicit export |

Assets to protect: the **app shell** (session, storage, other quizzes and spaces)
and the **confidentiality** of the user's content.

---

## 2. Key threats & mitigations

### T1 — A malicious quiz escapes the sandbox and steals shell data
**Primary control.** The reader mounts each quiz in an `iframe` with
`sandbox="allow-scripts …"` **without `allow-same-origin`**. The document gets an
**opaque origin**: it cannot share `localStorage`, IndexedDB, or cookies, and
cannot reach the app's APIs. Even fully hostile scripts stay confined.
→ see [`lib/sandbox.js`](lib/sandbox.js), [`app/run/[id]/page.jsx`](app/run/[id]/page.jsx).

> This fixes the classic `allow-scripts` **+** `allow-same-origin` vulnerability,
> which lets sandboxed content remove its own sandbox and reach the origin.

### T2 — Losing progress due to isolation
**Mitigation.** A `postMessage` storage bridge: an injected shim exposes a *fake*
`localStorage`, seeded from a snapshot and mirrored back to the shell (with an
**origin token** and an `event.source` check). The shell persists it to
IndexedDB — encrypted if the space is a vault. No origin access is granted.

### T3 — Exfiltration via external resources / shell injection
**Mitigation.** A strict `Content-Security-Policy` on the shell plus hardened
headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
COOP, CORP, HSTS). → [`next.config.mjs`](next.config.mjs).

### T4 — Data theft at rest (lost device, backups)
**Mitigation.** **Vault** spaces: **AES‑GCM‑256** encryption with a key derived
via **PBKDF2 (SHA‑256, 210k iterations)** and a per‑space salt. The passphrase
and key live **in memory only** and are never persisted. → [`lib/crypto.js`](lib/crypto.js).

### T5 — The cloud server reads content (sync)
**Mitigation.** **Zero‑knowledge** sync: for vault spaces the payload is
encrypted client‑side; the server stores an **opaque per‑user blob**, isolated by
identity (Google `sub`) and size‑limited. → [`app/api/sync/route.js`](app/api/sync/route.js).

### T6 — Authentication token handling
**Mitigation.** Google's ID token is verified **server‑side** (issuer, audience,
`email_verified`) and exchanged for a signed **`httpOnly`** session cookie
(HMAC‑SHA256). The token is never exposed to client‑side JavaScript.
→ [`app/api/session/route.js`](app/api/session/route.js), [`lib/jwt.js`](lib/jwt.js).

### T7 — Hostile popups / navigations
**Mitigation.** `allow-popups-to-escape-sandbox` is **not** granted: any popup
stays confined within the sandbox.

### T8 — Content integrity
**Mitigation.** A **SHA‑256** fingerprint is stored per quiz (change/duplicate
detection).

---

## 3. What is NOT covered (honest limits)

- Quiz **content** can still show misleading text or open links: only open files
  you trust. Isolation protects the app, not your judgment about the content.
- An attacker with **physical, unlocked** access to the device can read non‑vault
  spaces (that's exactly what vaults are for).
- Encryption is only as strong as your **passphrase**. It is not recoverable.

---

## 4. Deployment best practices

- Serve **over HTTPS only** (Web Crypto and HSTS require it).
- Set `AUTH_SECRET` via `openssl rand -base64 32`; never use the dev default.
- Keep dependencies current (`npm audit`).
- Cloud sync is optional: if you don't need it, don't set `KV_*`.

---

## 5. Reporting a vulnerability

Please report privately via **[/.well-known/security.txt](public/.well-known/security.txt)**.
**Do not** open public issues for security problems — allow time for a coordinated
fix. Good‑faith reports are very welcome.

_Threat model last updated: 2026‑07._
