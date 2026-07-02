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
**Mitigation (defense in depth).**
1. A **per‑quiz CSP** is injected as a `<meta>` tag inside every sandboxed
   document: by default the quiz is fully **network‑locked** (`connect-src
   'none'`, images/media/fonts only from `data:`/`blob:`). A per‑quiz opt‑in
   allows *passive* remote resources (images/fonts/media); `fetch`/XHR and
   remote scripts stay blocked even then. → [`lib/sandbox.js`](lib/sandbox.js).
2. `allow-popups` is **not** granted: `window.open` to an attacker URL (a
   classic exfiltration channel from opaque‑origin frames) is impossible.
3. Snapshot data is embedded with hardened JSON — the `<` character and the
   U+2028/U+2029 separators are unicode‑escaped — so quiz‑controlled values
   cannot break out of the injected shim (`</script>` injection).
4. Storage messages from the sandbox are accepted only from an **opaque origin**
   (`event.origin === "null"`), with the origin token, an `event.source` check
   and a **4 MB size cap** (anti quota‑flooding).
5. A strict `Content-Security-Policy` on the shell plus hardened headers
   (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP,
   CORP, HSTS, `Origin-Agent-Cluster`). Note: `srcdoc` documents **inherit** the
   shell CSP, so the network lockdown holds even without the meta tag.
   → [`next.config.mjs`](next.config.mjs).

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
**Mitigation.** A **SHA‑256** fingerprint is stored per quiz at upload time and
**re‑verified on every open**: the runner shows an *integro / modificato* badge,
so corruption or tampering of the stored HTML is detected immediately.

### T9 — Data loss (eviction, "clear browsing data", corruption)
**Mitigation.** The **Guardian** (→ [`lib/guardian.js`](lib/guardian.js))
replicates the whole database across independent layers, automatically and
debounced after every write:

| Layer | Where | Survives |
|---|---|---|
| L1 IndexedDB | browser storage | normal use (+ `navigator.storage.persist`) |
| L2 OPFS replica | Origin Private File System, **A/B slots + SHA‑256 checksum** | partial corruption, interrupted writes |
| L3 Backup folder | a **real folder on disk** via the File System Access API (latest + 7 daily copies) | *clear browsing data*, eviction, reinstall |
| L4 Cloud sync | optional, zero‑knowledge | device loss |

On boot, if the database is empty but a **checksum‑valid replica** exists, the
app offers one‑click recovery. Every replica stores vault records **still
encrypted** — the zero‑knowledge property holds across all layers. Guardian
metadata (folder handles) is excluded from exports.

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
