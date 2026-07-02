<div align="center">

<h1>QuizHub&nbsp;OS&nbsp;<kbd>QH</kbd></h1>

### A computer inside your browser for running quizzes, exams & presentations — as self‑contained HTML.

**Local‑first · zero‑knowledge · sandbox‑isolated · installable PWA**

<p>
<a href="https://quizhub-psi.vercel.app/"><img alt="Live demo" src="https://img.shields.io/badge/▶_Live_demo-quizhub--psi.vercel.app-5b8cff?style=for-the-badge&labelColor=070b16"></a>
</p>

<p>
<img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=nextdotjs">
<img alt="React" src="https://img.shields.io/badge/React-18-149eca?style=for-the-badge&logo=react&logoColor=white">
<img alt="PWA" src="https://img.shields.io/badge/PWA-offline--ready-7c5cff?style=for-the-badge">
<img alt="Security" src="https://img.shields.io/badge/Sandbox-isolated-21e6c1?style=for-the-badge">
<img alt="License" src="https://img.shields.io/badge/License-MIT-34e39a?style=for-the-badge">
</p>

<p><b><a href="https://quizhub-psi.vercel.app/">🚀 Open the live app →</a></b></p>

</div>

---

> **Upload any `.html` quiz, exam trainer, flashcard tool or slide deck — then run it in a secure, isolated window, organized like a real OS.** Everything lives in your browser (IndexedDB). No database required. Cloud sync is optional and zero‑knowledge.

<div align="center">

`Spaces` &nbsp;·&nbsp; `Nested folders` &nbsp;·&nbsp; `Tabbed reader` &nbsp;·&nbsp; `Exam timer` &nbsp;·&nbsp; `Encrypted vaults` &nbsp;·&nbsp; `Command palette` &nbsp;·&nbsp; `Optional Google login`

</div>

---

## Table of contents

- [Why QuizHub OS](#why-quizhub-os)
- [Features](#features)
- [Security model](#security-model)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables — keys & secrets](#environment-variables--keys--secrets)
  - [Google login (Client ID)](#1-google-login--client-id)
  - [Session secret](#2-session-secret-auth_secret)
  - [Cloud sync (Vercel KV / Upstash)](#3-cloud-sync--vercel-kv--upstash)
- [Deploy on Vercel](#deploy-on-vercel)
- [Install as an app (PWA)](#install-as-an-app-pwa)
- [Project structure](#project-structure)
- [Roadmap & vision](#roadmap--vision)
- [Contributing](#contributing)
- [License](#license)

---

## Why QuizHub OS

Most quiz apps lock you into a proprietary format and a cloud database. **QuizHub OS does the opposite:** it runs *your own* self‑contained HTML files — the trainers you generate or collect — and keeps them **on your device**, safe and offline.

It was built for exam season: collect your HTML quizzes once, organize them into **spaces** and **nested folders**, and open them anywhere — including iPad, as a home‑screen app.

|  | QuizHub OS |
|---|---|
| **Privacy** | Content stays encrypted on your device. Cloud is optional & zero‑knowledge. |
| **No lock‑in** | Open JSON export/import. Your files stay yours. |
| **Runs anything** | Any `.html` — quizzes, exams, slides — sandboxed and safe. |
| **OS‑like UX** | Spaces, folders, tabs, command palette. Fast and delightful. |
| **Offline‑first** | Full PWA. Works on trains, in libraries, anywhere. |

---

## Features

### 🗂️ Organization
- **Spaces** — isolated workspaces (an OS‑style dock), optionally tied to your Google account.
- **Nested folders** — paths like `Physics/Mechanics/Kinematics`, with a tree sidebar, breadcrumbs, create/rename/delete, and **drag‑and‑drop** of quizzes into folders.
- **Full‑text search** over name, note, folder and **tags**.
- **Favorites**, notes, tags, rename, delete.
- **Command palette** (`⌘K` / `Ctrl+K`) to jump to any quiz, space, folder or command.

### 🖥️ The reader — a "desktop window"
- **Multiple tabs** — open several quizzes side by side.
- **Zoom**, **fullscreen**, reload.
- **Exam timer** with amber/red warnings and pause.
- Progress persists safely across sessions.

### 🔒 Security & privacy
- Untrusted HTML runs in a **truly isolated sandbox** (opaque origin).
- **Network‑locked quizzes**: a per‑quiz CSP blocks all Internet access by default (opt‑in for remote images/fonts; fetch stays blocked).
- **Integrity badge**: each quiz is SHA‑256 fingerprinted and re‑verified on every open.
- **AES‑256 encrypted vault spaces** with a passphrase (end‑to‑end, on device).
- **Zero‑knowledge cloud sync** — the server only ever stores ciphertext.
- Strict **Content‑Security‑Policy** and hardened HTTP headers.

### 🛡 Guardian — storage that survives
- **Multi‑layer automatic replication**: IndexedDB → OPFS replica (A/B slots + SHA‑256 checksums) → **a real folder on your disk** (File System Access API; latest + 7 daily copies) → optional cloud.
- **Self‑healing**: if the database is ever wiped, QuizHub detects the surviving replica at boot and offers one‑click recovery.
- Vaults stay **encrypted in every replica** — zero‑knowledge across all layers.

### ☁️ Backup & sync
- **Export / Import** an entire space as portable JSON.
- **Optional cloud sync** (Vercel KV / Upstash) — per‑user, encrypted.

### 📲 PWA
- Installable on Safari / Chrome / Edge. Great as an iPad home‑screen app.
- App shell cached, works offline.

---

## Security model

QuizHub OS **executes arbitrary user‑supplied HTML**, so security is the core requirement, not an afterthought.

- **Sandbox isolation** — quizzes render in an `iframe` with `sandbox="allow-scripts …"` **without `allow-same-origin`**. They get an *opaque origin* and **cannot** read the app's session, storage, IndexedDB, or call its APIs. *(This fixes the classic `allow-scripts` + `allow-same-origin` escape.)*
- **Secure storage bridge** — a `postMessage` shim (with an origin token) mirrors the quiz's fake `localStorage` back to the app, so progress persists **without** granting origin access.
- **Encryption at rest** — vault spaces use **AES‑GCM‑256** with a key derived via **PBKDF2 (SHA‑256, 210k iterations)**. The passphrase and key live in memory only.
- **Zero‑knowledge sync** — vault payloads are encrypted client‑side; the server stores an opaque per‑user blob.
- **Hardened headers** — CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, HSTS.

📄 Full threat model: **[SECURITY.md](SECURITY.md)** · Responsible disclosure: **[/.well-known/security.txt](public/.well-known/security.txt)**

---

## Tech stack

- **Next.js 14** (App Router) · **React 18**
- **IndexedDB** — local‑first storage (zero libraries)
- **Web Crypto API** — AES‑GCM + PBKDF2 (vault encryption), HMAC (session token)
- **Google Identity Services** — optional Google login (Client ID only, no secret)
- **Vercel KV / Upstash** — optional sync over REST (no extra dependency)
- **PWA** — manifest + service worker

> **Everything works with zero configuration.** The app is fully local‑first out of the box; every environment variable below is optional.

---

## Getting started

**Prerequisites:** [Node.js 18+](https://nodejs.org/) and npm.

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server
npm run dev
# → http://localhost:3000

# 3. Production build
npm run build
npm start
```

That's it — no keys needed to start using it.

---

## Environment variables — keys & secrets

All variables are **optional**. Add only what you want to enable.

Create a local env file from the template:

```bash
cp .env.example .env.local
```

| Variable | Enables | Required? |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google login | Optional |
| `AUTH_SECRET` | Signed session cookie (needed if login is on) | Optional |
| `KV_REST_API_URL` | Cloud sync backend | Optional |
| `KV_REST_API_TOKEN` | Cloud sync backend | Optional |

> On Vercel, add these under **Project → Settings → Environment Variables**, then **redeploy**.

### 1. Google login — Client ID

QuizHub uses **Google Identity Services**, so you only need a **public Client ID** — **no client secret, no server callback**.

**Where to get it:**

1. Open the **[Google Cloud Console](https://console.cloud.google.com/)** and create (or pick) a project.
2. Go to **APIs & Services → OAuth consent screen** and configure it (External is fine; add yourself as a test user while in testing).
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Choose **Application type: Web application**.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (development)
   - `https://quizhub-psi.vercel.app` (and/or your own domain)
6. **Leave "Authorized redirect URIs" empty** — GIS doesn't need one.
7. Click **Create** and copy the **Client ID** (looks like `1234567890-abc.apps.googleusercontent.com`).

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abcxyz.apps.googleusercontent.com
```

> The `NEXT_PUBLIC_` prefix is intentional — the Client ID is public by design and is embedded in the browser bundle. It is **not** a secret.

### 2. Session secret (`AUTH_SECRET`)

When login is enabled, Google's ID token is verified **server‑side** and turned into a signed `httpOnly` session cookie (HMAC‑SHA256). This needs a random secret:

```bash
openssl rand -base64 32
```

```env
AUTH_SECRET=paste-the-generated-value-here
```

> Keep this **private**. Never commit it. Set a strong value in production.

### 3. Cloud sync — Vercel KV / Upstash

Cloud sync is optional and **zero‑knowledge** (encrypted client‑side for vault spaces). It uses a Redis‑compatible REST store.

**Option A — Vercel KV (easiest on Vercel):**
1. In your Vercel project: **Storage → Create Database → KV**.
2. Connect it to the project — Vercel auto‑adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your env.

**Option B — Upstash Redis (any host):**
1. Create a database at **[upstash.com](https://upstash.com/)**.
2. From the database page, copy the **REST URL** and **REST TOKEN**.

```env
KV_REST_API_URL=https://your-db.upstash.io
KV_REST_API_TOKEN=your-rest-token
```

> If these are missing, sync is simply disabled and the app stays 100% local‑first.

---

## Deploy on Vercel

1. Push this repo to GitHub.
2. On **[Vercel](https://vercel.com/)** → **Add New → Project** → import the repo.
3. Keep the default Next.js settings and **Deploy**.
4. *(Optional)* Add the [environment variables](#environment-variables--keys--secrets) under **Settings → Environment Variables**, then redeploy.
5. Remember to add your production URL (e.g. `https://quizhub-psi.vercel.app`) to the Google **Authorized JavaScript origins**.

Prefer the CLI?

```bash
npm i -g vercel
vercel
vercel --prod
```

---

## Install as an app (PWA)

1. Open the [live app](https://quizhub-psi.vercel.app/) (or your deployment) in **Safari** (iOS) or **Chrome/Edge** (desktop/Android).
2. **iOS:** Share → **Add to Home Screen**. **Desktop:** click the install icon in the address bar.
3. Launch QuizHub OS like a native study app — offline‑ready.

---

## Project structure

```text
app/
  page.jsx                 desktop: spaces dock, library, folder tree, palette, vaults
  run/[id]/page.jsx        tabbed reader with isolated sandbox + exam timer
  login/page.jsx           Google sign‑in (GIS)
  api/session/route.js     login: verifies Google ID token → signed cookie
  api/sync/route.js        optional cloud sync (zero‑knowledge)
lib/
  db.js                    IndexedDB: spaces, nested folders, transparent encryption
  guardian.js              multi‑layer replication (OPFS + disk folder) & self‑healing
  crypto.js                Web Crypto (AES‑GCM, PBKDF2)
  jwt.js                   sign/verify the session cookie (HMAC)
  sandbox.js               secure srcdoc bridge + storage shim + per‑quiz CSP
  sync.js                  sync client
  plan.js                  plan / feature‑flag scaffolding
next.config.mjs            CSP + security headers
public/                    manifest, service worker, icons, security.txt
```

---

## Roadmap & vision

From personal project to a real, installable, sustainable product — without ever betraying the **local‑first, privacy‑first** principle. Native app packaging (Capacitor/Tauri), encrypted space sharing, an AI quiz generator, spaced repetition, and a freemium model where **everything local stays free**.

📄 See **[ROADMAP.md](ROADMAP.md)** for the full plan.

---

## Contributing

Issues and PRs are welcome. For anything security‑related, please **do not open a public issue** — see [SECURITY.md](SECURITY.md) for responsible disclosure.

```bash
# Fork, branch, then:
npm install
npm run dev
```

---

## License

**MIT** — see [LICENSE](LICENSE). Use it, learn from it, build on it.

<div align="center">
<br>
<b>Made for students who deserve a fast, private, beautiful place to study.</b>
<br><br>
<a href="https://quizhub-psi.vercel.app/">quizhub-psi.vercel.app</a>
</div>
