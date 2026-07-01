<div align="center">

# QuizHub OS <kbd>QH</kbd>

![QuizHub OS](https://img.shields.io/badge/QH-QuizHub_OS-5b8cff?style=for-the-badge&labelColor=070b16)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=nextdotjs)
![PWA](https://img.shields.io/badge/PWA-offline--ready-7c5cff?style=for-the-badge)
![Security](https://img.shields.io/badge/Sandbox-isolated-21e6c1?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-34e39a?style=for-the-badge)

**Un computer nel browser per leggere quiz, esami e presentazioni HTML.**
Local-first, spazi multi-utente, sandbox blindata, cifratura end-to-end e sync cloud opzionale.

[Cosa c'è di nuovo](#cosa-cè-di-nuovo-in-v2) • [Sicurezza](#modello-di-sicurezza) • [Funzioni](#funzioni) • [Avvio rapido](#avvio-rapido) • [Deploy](#deploy-su-vercel) • [Login & sync](#login-google-e-sync-cloud-opzionali)

</div>

---

## Cos'è QuizHub OS?

**QuizHub OS** è una **PWA Next.js** che trasforma il browser in un piccolo "sistema operativo" per lo studio: carichi i tuoi **file HTML autoconsistenti** (quiz, trainer d'esame, slide, flashcard) e li apri in una **finestra isolata e sicura**, con tab multiple, come se fossero app.

Nato per la preparazione agli esami universitari: generi o raccogli quiz HTML, li carichi una volta, li organizzi per spazio/categoria e li apri quando vuoi — anche **offline**, anche **su iPad**.

Nessun database obbligatorio. I quiz vivono nel tuo browser (**IndexedDB**); il cloud è **opzionale**.

---

## Cosa c'è di nuovo in v2

Rispetto alla v1 (`PSS Quiz Hub`), questa versione è una riscrittura completa:

| Area | v1 | v2 — QuizHub OS |
|---|---|---|
| **Sicurezza runner** | `iframe` con `allow-scripts` **+ `allow-same-origin`** → un quiz malevolo poteva evadere la sandbox e leggere la tua sessione/IndexedDB | Sandbox **senza `allow-same-origin`** (origine opaca) + **CSP severa** + header di sicurezza. Isolamento reale. |
| **Utenti** | singola libreria per dispositivo | **spazi multipli** isolati (dock stile OS), legati opzionalmente all'account Google |
| **Dati** | quiz in chiaro | **cifratura AES-256 end-to-end** opzionale per-spazio (vault con passphrase) |
| **Runner** | pagina singola | **finestra con tab multiple**, zoom, fullscreen, **timer d'esame** |
| **Persistenza quiz** | `localStorage` diretto | **ponte storage** via `postMessage`: i progressi si salvano (cifrati) senza aprire la sandbox |
| **Studio** | ricerca, cartelle, preferiti, note | + **tag**, **statistiche**, **ricerca full-text**, **command palette** (⌘K) |
| **Backup** | — | **export/import** JSON portabile |
| **Cloud** | — | **sync opzionale zero-knowledge** (Vercel KV/Upstash) |
| **Stile** | tema chiaro "carta" | tema **scuro/chiaro** futuristico: vetro, neon, griglia |

> ⚠️ **Migrazione automatica:** i quiz della v1 vengono spostati nello **Spazio locale** al primo avvio (nessuna perdita di dati).

---

## Modello di sicurezza

La priorità è che **un HTML caricato non possa fare male alla tua app o ai tuoi altri dati**.

1. **Isolamento del runner.** I quiz girano in un `iframe` con `sandbox="allow-scripts …"` **ma senza `allow-same-origin`**: hanno un'**origine opaca**, quindi **non** possono leggere cookie, `localStorage`, IndexedDB, né chiamare le API della shell. *(È il fix del buco più grave della v1.)*
2. **Ponte storage sicuro.** Senza `allow-same-origin` il `localStorage` del quiz è finto: viene inizializzato da uno snapshot e ogni scrittura è rispecchiata alla shell via `postMessage` (con token di verifica), che la salva in IndexedDB. Così i progressi persistono **senza** concedere accesso all'origine.
3. **Cifratura a riposo (vault).** Ogni spazio può essere cifrato **AES-GCM 256** con chiave derivata via **PBKDF2 (210k iter, SHA-256)**. La passphrase e la chiave vivono **solo in memoria**; il server (se usi il sync) vede solo ciphertext.
4. **Header HTTP.** `Content-Security-Policy` severa, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP/CORP`, `HSTS` (vedi [`next.config.mjs`](next.config.mjs)).
5. **Integrità.** Ogni quiz ha un fingerprint `SHA-256` del contenuto.

> Nota: "sicurezza al massimo" qui significa **isolamento e riservatezza locale**. La responsabilità del contenuto dei quiz resta tua: apri solo file di cui ti fidi.

---

## Funzioni

### Spazi (multi-utente)
- Dock laterale con **spazi separati e isolati**, ognuno con colore e nome.
- Spazi **cifrati** (vault) con lucchetto: blocca/sblocca al volo.
- Ogni spazio ha le sue **statistiche** (quiz, preferiti, categorie, spazio usato).

### Libreria
- Carica uno o più `.html` (drag & drop incluso).
- **Ricerca full-text** su nome, nota, categoria e **tag**.
- Categorie, **preferiti**, note, tag, rinomina, elimina.
- **Command palette** `⌘K` / `Ctrl+K` per saltare a quiz, spazi o comandi.

### Runner "finestra desktop"
- **Tab multiple**: apri più quiz nella stessa finestra.
- **Zoom**, **schermo intero**, ricarica.
- **Timer d'esame** con avvisi (giallo/rosso) e pausa.
- Sandbox isolata con progressi persistenti.

### Backup & sync
- **Export/Import** JSON di un intero spazio.
- **Sync cloud opzionale** (zero-knowledge) se configuri Vercel KV/Upstash.

### PWA
- Installabile (Safari/Chrome/Edge), ottima su iPad Home Screen.
- App-shell in cache, funziona offline.

---

## Avvio rapido

Serve **Node.js 18+**.

```bash
npm install
npm run dev
# http://localhost:3000
```

Build di produzione:

```bash
npm run build
npm start
```

> Tutto funziona **senza alcuna variabile d'ambiente**: l'app è local-first per default.

---

## Deploy su Vercel

1. Push del repo su GitHub.
2. Vercel → **Add New → Project** → importa il repo.
3. Impostazioni Next.js di default → **Deploy**.

Sufficiente per la versione senza login. Per login e sync, vedi sotto.

---

## Login Google e sync cloud (opzionali)

Copia `.env.example` in `.env.local` e compila solo ciò che ti serve.

### Login Google (Auth.js / NextAuth v5)

```env
AUTH_ENABLED=true
AUTH_SECRET=genera-con-openssl-rand-base64-32
AUTH_GOOGLE_ID=xxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=xxx
```

Callback OAuth: `https://<tuo-dominio>/api/auth/callback/google`.
Con il login attivo, gli spazi possono essere legati al tuo account e si abilita il sync.

### Sync cloud (zero-knowledge)

```env
KV_REST_API_URL=https://<...>.upstash.io
KV_REST_API_TOKEN=xxx
```

Usa **Vercel KV / Upstash Redis** via REST (nessuna dipendenza aggiuntiva). Ogni utente vede **solo** il proprio blob; per gli spazi vault il payload è già cifrato lato client. Se le variabili mancano, il sync resta disattivato e l'app continua a funzionare local-first.

---

## Stack tecnico

- **Next.js 14** (App Router) · **React 18**
- **NextAuth v5 (Auth.js)** — login Google opzionale
- **IndexedDB** — archivio local-first (zero librerie)
- **Web Crypto API** — AES-GCM + PBKDF2 (cifratura vault)
- **Vercel KV / Upstash** — sync opzionale via REST
- **PWA** — manifest + service worker

Struttura:

```text
app/
  page.jsx            desktop: dock spazi, libreria, palette, vault
  run/[id]/page.jsx   runner a tab con sandbox sicura + timer
  login/page.jsx      accesso Google
  api/auth/...        NextAuth
  api/sync/route.js   sync cloud opzionale (zero-knowledge)
lib/
  db.js               IndexedDB multi-spazio + cifratura trasparente
  crypto.js           Web Crypto (AES-GCM, PBKDF2)
  sandbox.js          bridge sicuro srcdoc + shim storage
  sync.js             client di sincronizzazione
next.config.mjs       CSP + header di sicurezza
```

---

## Licenza

MIT — vedi [LICENSE](LICENSE).
