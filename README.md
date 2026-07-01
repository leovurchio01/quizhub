# PSS Quiz Hub

Una piccola web-app (Next.js) da mettere su **Vercel** per **caricare i tuoi quiz HTML ed eseguirli dal browser dell'iPad**. La salvi come icona sulla Home (PWA) e la apri quando ti serve, anche **offline**.

- I quiz vengono salvati **nel browser del dispositivo** (IndexedDB): niente database, niente costi, nessun dato che esce dall'iPad.
- Libreria con **ricerca, categorie, preferiti, note, rinomina ed elimina**.
- Ogni quiz gira in un **iframe** isolato ma con `localStorage` funzionante, così lo **storico interno del quiz** (punteggi, tentativi) viene salvato tra una sessione e l'altra.
- **Login Google opzionale**, spento di default (vedi sotto).

---

## 1) Deploy su Vercel — senza terminale (consigliato)

1. **Crea un repository su GitHub** e caricaci questa cartella.
   - Il modo più semplice: vai su [github.com/new](https://github.com/new), crea un repo vuoto (es. `pss-quiz-hub`), poi **Add file → Upload files** e trascina **tutto il contenuto della cartella** (NON caricare `node_modules` né `.next` se presenti).
2. Vai su [vercel.com](https://vercel.com) → accedi (puoi usare il tuo account GitHub) → **Add New… → Project** → **Import** il repo appena creato.
3. Lascia tutte le impostazioni di default (Framework: *Next.js*, rilevato in automatico) e premi **Deploy**. Non serve configurare nulla: l'app parte **aperta, senza login**.
4. Al termine ottieni un URL tipo `https://pss-quiz-hub-xxxx.vercel.app`.

### Metterla come app sull'iPad
1. Apri quell'URL con **Safari** sull'iPad.
2. Tocca **Condividi** (l'icona con la freccia) → **Aggiungi a Home**.
3. Ora hai l'icona "PSS Quiz" a tutto schermo. Funziona anche senza rete.

---

## 2) Deploy con la CLI Vercel (alternativa)

Se preferisci il terminale:

```bash
npm i -g vercel
cd pss-quiz-hub
vercel          # segui le domande (accetta i default)
vercel --prod   # deploy in produzione
```

---

## 3) Come si usa

1. Apri l'app e premi **＋ Carica quiz** (o trascina i file).
2. Carica gli HTML che hai già (es. `pss_exam_trainer.html`, `quiz_pss_laboratorio.html`, `laboratorio_esercizi_pss.html`). Puoi caricarne più d'uno insieme.
3. Da **⋯** su ogni scheda puoi assegnare una **categoria** (es. *Teoria*, *Laboratorio*, *Ripasso*), scrivere una **nota** o rinominare/eliminare. La stella li mette tra i **preferiti**.
4. **▶ Apri** esegue il quiz a tutto schermo. Il pulsante ↻ lo ricarica; ⤢ va a schermo intero.

> I quiz sono salvati **solo su quel dispositivo**. Se apri l'app su un altro device, la libreria sarà vuota: ricarica lì i file. (È la scelta "storage locale" che hai indicato: semplice e gratis.)

---

## 4) (Opzionale) Attivare il login con Google

L'app è pensata per funzionare **offline**, quindi di default il login è **disattivato** (con storage locale non protegge alcun dato condiviso). Se vuoi comunque un cancello con Google:

1. **Google Cloud Console** → crea un progetto → **API e servizi → Schermata consenso OAuth** (tipo *Esterno*; in modalità *Testing* aggiungi la tua email tra i *Test users*, oppure pubblica l'app).
2. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**.
   - In **URI di reindirizzamento autorizzati** aggiungi:
     `https://IL-TUO-DOMINIO.vercel.app/api/auth/callback/google`
   - (Se usi anche i deploy di anteprima, aggiungi pure i relativi domini.)
   - Copia **Client ID** e **Client secret**.
3. Su **Vercel → Settings → Environment Variables** aggiungi:
   - `AUTH_ENABLED` = `true`
   - `AUTH_SECRET` = una stringa casuale (genera con `openssl rand -base64 32`)
   - `AUTH_GOOGLE_ID` = il Client ID
   - `AUTH_GOOGLE_SECRET` = il Client secret
4. **Ridploya** (Deployments → Redeploy) perché le variabili abbiano effetto.

Note:
- In modalità *Testing* Google mostra un avviso "app non verificata": prosegui con **Avanzate → Vai al sito** (o aggiungi la tua email come *test user*). Per toglierlo del tutto serve la verifica dell'app (privacy policy, dominio, ecc.): per uso personale non ne vale la pena.
- Con il login **attivo l'uso offline non funziona** (senza rete non si può passare dal gate). Per studiare offline, lascia `AUTH_ENABLED=false`.

---

## 5) Dettagli tecnici

- **Next.js 14** (App Router), nessuna libreria UI esterna. Font di sistema Apple (New York / SF / SF Mono): zero download, resa nativa su iPad.
- **PWA**: `manifest.webmanifest` + service worker (`public/sw.js`) che mette in cache l'app-shell per l'uso offline.
- **Storage**: IndexedDB (`lib/db.js`), un record per quiz `{ id, name, html, folder, note, favorite, size, date }`.
- **Esecuzione quiz**: `<iframe srcdoc>` con `sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-downloads"`. `allow-same-origin` è necessario perché il `localStorage` interno del quiz (storico dei tentativi) persista; il contenuto resta comunque incapsulato nell'iframe. Poiché carichi HTML tuoi e fidati, è la scelta bilanciata corretta.
- **Auth**: NextAuth v5 (Auth.js) con provider Google, attivabile via `AUTH_ENABLED`. Il gate è nel `middleware.js`.

### Aggiornare l'app in futuro
Se ti do una nuova versione: sostituisci i file nel repo (o fai `git push`) e Vercel ridploya da solo. Con la CLI: `vercel --prod`.

---

## Struttura del progetto

```
pss-quiz-hub/
├─ app/
│  ├─ layout.jsx            # metadati PWA
│  ├─ globals.css           # design (schedario, dorsi colorati)
│  ├─ page.jsx              # libreria: upload, ricerca, categorie, note…
│  ├─ login/page.jsx        # login Google (se attivo)
│  ├─ run/[id]/page.jsx     # esecuzione del quiz nell'iframe
│  └─ api/auth/[...nextauth]/route.js
├─ lib/db.js                # wrapper IndexedDB
├─ components/SWRegister.jsx
├─ public/                  # manifest, sw.js, icone
├─ auth.js / auth.config.js # NextAuth (opzionale)
├─ middleware.js            # gate di accesso
├─ .env.example
└─ package.json
```
