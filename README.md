<div align="center">

# QuizHub <kbd>QH</kbd>

![QuizHub](https://img.shields.io/badge/QH-QuizHub-ff9900?style=for-the-badge&labelColor=111111)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=nextdotjs)
![PWA](https://img.shields.io/badge/PWA-offline--ready-5A67D8?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Your personal exam-quiz vault. Upload HTML quizzes, organize them like a study library, and run them anywhere — especially on iPad.**

Built for students who want a clean, fast, offline-friendly place to keep serious exam trainers without paying for a database or installing an app.

[Features](#features) • [Demo flow](#demo-flow) • [Quick start](#quick-start) • [Deploy on Vercel](#deploy-on-vercel) • [Google login](#optional-google-login) • [Tech stack](#tech-stack)

</div>

---

## What is QuizHub?

**QuizHub** is a small but polished **Next.js PWA** that lets you upload and run your own **self-contained HTML quiz files** from the browser.

It was designed for university exam prep: you generate or collect HTML quizzes, upload them once, organize them by subject, and open them later from your iPad like a real study app.

No backend database. No subscriptions. No cloud storage required.

Your quizzes stay in your browser using **IndexedDB**, and each quiz can keep its own internal progress/history using `localStorage`.

---

## Why students will like it

- **Perfect for exam season** — keep theory quizzes, lab trainers, mock exams and flashcard-style HTML tools in one place.
- **iPad-friendly** — deploy it, open it in Safari, then add it to the Home Screen like an app.
- **Offline-first mindset** — great for trains, libraries, classrooms, and study sessions with bad Wi-Fi.
- **Local-first privacy** — your uploaded quiz files stay on the device unless you choose to share/deploy something yourself.
- **No database setup** — Vercel + browser storage is enough.
- **Simple but serious** — search, folders, favorites, notes, rename, delete and full-screen quiz runner.

---

## Features

### Quiz library

- Upload one or multiple `.html` quiz files.
- Store quizzes locally in **IndexedDB**.
- Search by name, folder/category or notes.
- Add folders/categories such as `Theory`, `Lab`, `Mock Exam`, `Weak Topics`.
- Mark quizzes as favorites.
- Rename quizzes.
- Add personal notes.
- Delete quizzes when you no longer need them.

### Quiz runner

- Opens each HTML quiz inside a dedicated runner page.
- Uses an `iframe srcdoc` approach so the quiz runs directly in-browser.
- Keeps `localStorage` available inside the quiz, useful for quiz history, scores and saved attempts.
- Includes quick actions such as reload and fullscreen.

### PWA experience

- Installable from Safari / Chrome / Edge.
- Works well as an iPad Home Screen app.
- Includes manifest, service worker and app icons.
- Caches the app shell for fast access.

### Optional Google login

- Google authentication is included but disabled by default.
- Useful if you deploy the app publicly and want a simple access gate.
- Can be enabled with environment variables.

> By default, QuizHub is open and local-first because the uploaded quizzes are saved in the browser, not in a shared cloud database.

---

## Demo flow

```text
1. Deploy QuizHub on Vercel
2. Open it on your iPad
3. Add it to Home Screen
4. Upload your quiz HTML files
5. Organize them by course/topic
6. Start training for the exam
```

Example categories:

```text
Software Security
Secure Software Design
JML
JUnit
Coverage
FSM / EFSM / CFSM
Mock Exams
Mistakes to Review
```

---

## Quick start

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
npm start
```

---

## Deploy on Vercel

### Option 1 — GitHub import

1. Create a new GitHub repository.
2. Push this project to the repository.
3. Go to Vercel.
4. Click **Add New → Project**.
5. Import the GitHub repository.
6. Keep the default Next.js settings.
7. Click **Deploy**.

That is enough for the default version with no login.

### Option 2 — Vercel CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

---

## Add it to your iPad Home Screen

1. Open the deployed Vercel URL in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Launch QuizHub like a native study app.

---

## Optional Google login

Google login is available through **NextAuth / Auth.js**, but it is disabled by default.

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Then configure:

```env
AUTH_ENABLED=true
AUTH_SECRET=your-random-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

Google OAuth callback URL:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/auth/callback/google
```

Important note: if Google login is enabled, offline access is limited because authentication requires a network connection. For a pure offline study setup, keep:

```env
AUTH_ENABLED=false
```

---

## Security notes

QuizHub is designed for **HTML files you trust**.

The quiz runner uses:

```html
<iframe srcdoc="..." sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-downloads">
```

`allow-same-origin` is intentionally enabled so quiz files can persist their own `localStorage` data, such as attempts and scores.

Recommended usage:

- Upload only quiz HTML files you created or trust.
- Do not use it as a public random-HTML hosting platform.
- Do not commit `.env` files.
- Keep `.env.example` only as a safe template.

---

## Tech stack

- **Next.js 14**
- **React 18**
- **Auth.js / NextAuth v5** for optional Google login
- **IndexedDB** for local quiz storage
- **Service Worker** for PWA caching
- **Vercel** for deployment
- No external UI component library

---

## Project structure

```text
pss-quiz-hub/
├─ app/
│  ├─ layout.jsx
│  ├─ globals.css
│  ├─ page.jsx
│  ├─ login/page.jsx
│  ├─ run/[id]/page.jsx
│  └─ api/auth/[...nextauth]/route.js
├─ components/
│  └─ SWRegister.jsx
├─ lib/
│  └─ db.js
├─ public/
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  ├─ icon-192.png
│  ├─ icon-512.png
│  └─ apple-touch-icon.png
├─ auth.js
├─ auth.config.js
├─ middleware.js
├─ next.config.mjs
├─ package.json
└─ README.md
```
