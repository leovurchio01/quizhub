# Roadmap & Product Vision — QuizHub OS

> From a personal project to a **product**. This document traces the path to turn
> QuizHub OS into an installable app and, one day, a sustainable business — without
> ever betraying the **local‑first / privacy‑first** principle.

---

## Guiding principles

1. **Local‑first, always.** The app must work 100% offline and without an account.
   The cloud is an *upgrade*, not a requirement.
2. **Zero‑knowledge.** If you pay for sync, your content stays encrypted: we can't
   read it.
3. **Security is the product.** It's the differentiator against competitors.

---

## Phases

### ✅ Phase 0 — Foundations (done)
Isolated sandbox, multi‑user spaces, nested folders, encrypted vaults, tabbed
reader, exam timer, backup, optional sync, PWA, theming, optional Google login.

### 🔜 Phase 1 — "Real app" (packaging)
- **Installable PWA** already shipped (manifest + SW). Next: a polished install
  prompt, app shortcuts, and a **share target** (open shared `.html` files
  directly in QuizHub).
- **Desktop/mobile app** via [Capacitor](https://capacitorjs.com/) or
  [Tauri](https://tauri.app/): same codebase, iOS/Android/Mac/Win stores.
- `.html` file association → "Open in QuizHub".

### 🔭 Phase 2 — Collaboration & content
- **Share a space** via an encrypted link (key in the URL `#fragment`, never sent to the server).
- **Marketplace / community** of quizzes and trainers (revenue share with authors).
- **AI quiz generator** (Claude API) from notes/PDFs.
- **Study analytics**: learning curves, spaced repetition (SM‑2).

### 💳 Phase 3 — Monetization (freemium)
See the plans table below. Scaffolding already present in [`lib/plan.js`](lib/plan.js).

---

## Monetization model (draft)

| Plan | Price (idea) | Includes |
|---|---|---|
| **Free** | €0 | Full local‑first, unlimited local spaces, 1 vault, export/import |
| **Pro** | ~€3–5/mo | Encrypted multi‑device cloud sync, unlimited vaults, extra themes, versioned backups |
| **Team/Edu** | per seat | Shared spaces, class management, SSO, support |
| **Marketplace** | commission | Sell/share exam trainers between authors |

> Plan gates are **client‑side feature flags** + server‑side checks only for what
> touches the cloud (local stays free). No dark patterns.

### Infra / costs to evaluate
- Hosting: Vercel (Hobby → Pro).
- Sync storage: Vercel KV / Upstash (pay‑as‑you‑go, small encrypted blobs).
- Payments: Stripe (Billing + Customer Portal).
- Auth: Google Identity Services (already integrated).

---

## Why it can win against competitors

- **Real privacy**: content stays encrypted on device; the cloud is optional and zero‑knowledge.
- **No lock‑in**: open JSON export/import — your files stay yours.
- **Runs any HTML**: not a proprietary quiz format, but *your* trainers, safely.
- **"OS" experience**: spaces, folders, tabs, palette — fast and pleasant.

---

## Concrete next technical steps

- [ ] PWA install prompt + `share_target` in the manifest.
- [ ] Move IndexedDB to a single shared connection (perf).
- [ ] End‑to‑end test of the sandbox bridge (Playwright) as a security regression.
- [ ] `npm audit` in CI + Dependabot.
- [ ] Capacitor wrapper for a first mobile build.
- [ ] Stripe integration behind `lib/plan.js` once sync matures.
