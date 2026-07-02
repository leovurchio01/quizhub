"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  CloudUpload,
  Download,
  Folder as FolderIcon,
  FolderOpen,
  HelpCircle,
  Import as ImportIcon,
  Lock,
  LogIn,
  MoreVertical,
  Palette as PaletteIcon,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import {
  LOCAL_SPACE_ID,
  listSpaces,
  createSpace,
  deleteSpace,
  putSpace,
  listQuizzes,
  patchQuiz,
  deleteQuiz,
  restoreQuiz,
  purgeQuiz,
  emptyTrash,
  listTrash,
  trashCount,
  updateSpace,
  addQuizFromFile,
  spaceStats,
  exportSpace,
  importIntoSpace,
  exportEverything,
  importEverything,
  requestPersistence,
  storageInfo,
  setVaultKey,
  clearVaultKey,
  hasVaultKey,
  getMeta,
  setMeta,
  getFolders,
  addFolder,
  renameFolder,
  deleteFolder,
  moveQuizToFolder,
  normPath,
} from "@/lib/db";
import { createVault, unlockVault } from "@/lib/crypto";
import { pushSpace, pullSpace, SYNC_STATES } from "@/lib/sync";
import Dashboard from "@/components/Dashboard";
import {
  startGuardian,
  onGuardianChange,
  getGuardianState,
  checkRecovery,
  restoreFromReplica,
  connectBackupFolder,
  reauthorizeFolder,
  disconnectBackupFolder,
} from "@/lib/guardian";

const LOGIN_CONFIGURED = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SPINE = ["#5b8cff", "#21e6c1", "#ffcf5c", "#7c5cff", "#ff5d73", "#34e39a", "#ff8ac4", "#8aa0c8"];
function spineColor(seed) {
  if (!seed) return "#8aa0c8";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SPINE[h % SPINE.length];
}
function fmtSize(n) {
  if (!n) return "0 B";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return "—"; }
}
function initials(name) { return (name || "?").trim().slice(0, 2).toUpperCase(); }
function ancestors(path) {
  const parts = path.split("/");
  const out = [];
  let acc = "";
  for (const p of parts) { acc = acc ? acc + "/" + p : p; out.push(acc); }
  return out;
}

export default function Desktop() {
  const router = useRouter();
  const [spaces, setSpaces] = useState(null);
  const [activeId, setActiveId] = useState(LOCAL_SPACE_ID);
  const [quizzes, setQuizzes] = useState(null);
  const [stats, setStats] = useState(null);
  const [folderPaths, setFolderPaths] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("__all__"); // "__all__" | "__none__" | path
  const [expanded, setExpanded] = useState(new Set());
  const [dropPath, setDropPath] = useState(null);
  const [favOnly, setFavOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState("");
  const [look, setLook] = useState({ theme: "midnight", font: "system", bg: "grid" });
  const [showAppearance, setShowAppearance] = useState(false);
  const [showExplore, setShowExplore] = useState(false);
  const [clock, setClock] = useState("");
  const [session, setSession] = useState(undefined);
  const [showSpaceDlg, setShowSpaceDlg] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [unlockFor, setUnlockFor] = useState(null);
  const [palette, setPalette] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storage, setStorage] = useState(null);
  const [showProtect, setShowProtect] = useState(false);
  const [guard, setGuard] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [trash, setTrash] = useState(0);
  const [showTrash, setShowTrash] = useState(false);
  const [trashList, setTrashList] = useState([]);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [inputDlg, setInputDlg] = useState(null);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const activeSpace = useMemo(() => spaces?.find((s) => s.id === activeId) || null, [spaces, activeId]);
  const locked = !!(activeSpace?.vault && !hasVaultKey(activeId));
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2000); }, []);
  const askConfirm = useCallback((config) => new Promise((resolve) => setConfirmDlg({ ...config, resolve })), []);
  const askInput = useCallback((config) => new Promise((resolve) => setInputDlg({ ...config, resolve })), []);

  /* ---- bootstrap ---- */
  useEffect(() => {
    (async () => {
      const s = await listSpaces();
      setSpaces(s);
      const saved = await getMeta("activeSpaceId", LOCAL_SPACE_ID);
      setActiveId(s.some((x) => x.id === saved) ? saved : s[0].id);
      try {
        setLook({
          theme: localStorage.getItem("qh-theme") || "midnight",
          font: localStorage.getItem("qh-font") || "system",
          bg: localStorage.getItem("qh-bg") || "grid",
        });
        if (!localStorage.getItem("qh-onboarded")) setShowExplore(true);
      } catch {}
      // Chiede al browser di rendere lo storage persistente (anti-sfratto).
      await requestPersistence().catch(() => {});
      setStorage(await storageInfo().catch(() => null));
      // Guardian: repliche automatiche multi-livello + auto-riparazione.
      try {
        const gs = await startGuardian();
        setGuard(gs);
        onGuardianChange(setGuard);
        const rec = await checkRecovery();
        if (rec) setRecovery(rec);
        // I permessi sulla cartella decadono a ogni riavvio del browser:
        // serve un click dell'utente per riattivarli.
        else if (gs.folder?.connected && gs.folder?.permission !== "granted") setShowProtect(true);
      } catch {}
    })().catch(() => setSpaces([]));
    fetch("/api/session").then((r) => r.json()).then((s) => setSession(s?.user ? s : null)).catch(() => setSession(null));
  }, []);

  async function logout() {
    const ok = await askConfirm({
      title: "Esci dall'account?",
      description: "La libreria locale resta su questo dispositivo. Verrà chiusa solo la sessione cloud.",
      confirmLabel: "Esci",
      tone: "danger",
    });
    if (!ok) return;
    try { await fetch("/api/session", { method: "DELETE" }); } catch {}
    setSession(null);
    flash("Uscito");
  }

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    tick(); const id = setInterval(tick, 15000); return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async (sid = activeId) => {
    const [list, st, fp, tc] = await Promise.all([listQuizzes(sid), spaceStats(sid), getFolders(sid), trashCount(sid)]);
    setQuizzes(list); setStats(st); setFolderPaths(fp); setTrash(tc);
  }, [activeId]);

  useEffect(() => {
    if (!spaces) return;
    setQuizzes(null); setSel("__all__");
    setMeta("activeSpaceId", activeId).catch(() => {});
    if (!locked) refresh(activeId).catch(() => setQuizzes([]));
    else { setQuizzes([]); setStats(null); setFolderPaths([]); }
  }, [activeId, spaces, locked, refresh]);

  /* ---- personalizzazione (template) ---- */
  function applyLook(next) {
    setLook(next);
    const d = document.documentElement;
    next.theme && next.theme !== "midnight" ? d.setAttribute("data-theme", next.theme) : d.removeAttribute("data-theme");
    next.font && next.font !== "system" ? d.setAttribute("data-font", next.font) : d.removeAttribute("data-font");
    next.bg && next.bg !== "grid" ? d.setAttribute("data-bg", next.bg) : d.removeAttribute("data-bg");
    try {
      localStorage.setItem("qh-theme", next.theme);
      localStorage.setItem("qh-font", next.font);
      localStorage.setItem("qh-bg", next.bg);
    } catch {}
  }
  function dismissExplore() {
    setShowExplore(false);
    try { localStorage.setItem("qh-onboarded", "1"); } catch {}
  }

  /* ---- upload nella cartella selezionata ---- */
  async function handleFiles(fileList) {
    if (locked) return flash("Sblocca lo spazio per caricare");
    const files = Array.from(fileList || []).filter((f) => /\.html?$/i.test(f.name));
    if (!files.length) return flash("Servono file .html");
    const pre = sel !== "__all__" && sel !== "__none__" ? sel : "";
    for (const f of files) await addQuizFromFile(f, activeId, pre);
    await refresh();
    flash(files.length === 1 ? "Quiz caricato" : files.length + " quiz caricati");
    if (storage && !storage.persisted) tryPersist(); // ritenta in silenzio dopo l'uso
  }

  async function toggleFav(x) { await patchQuiz(x.id, { favorite: !x.favorite }); refresh(); }
  async function saveEdit(patch) {
    await patchQuiz(editing.id, patch);
    if (patch.folder) await addFolder(activeId, patch.folder);
    setEditing(null); refresh(); flash("Salvato");
  }
  async function removeQuiz(x) {
    await deleteQuiz(x.id); setEditing(null); refresh(); flash("Spostato nel cestino 🗑");
  }

  /* ---- cestino ---- */
  async function openTrash() {
    setTrashList(await listTrash(activeId));
    setShowTrash(true);
  }
  async function doRestore(id) { await restoreQuiz(id); setTrashList(await listTrash(activeId)); refresh(); flash("Quiz ripristinato"); }
  async function doPurge(id) {
    const ok = await askConfirm({
      title: "Eliminare definitivamente questo quiz?",
      description: "Il file verra rimosso in modo irreversibile dal cestino.",
      confirmLabel: "Elimina per sempre",
      tone: "danger",
    });
    if (!ok) return;
    await purgeQuiz(id); setTrashList(await listTrash(activeId)); refresh(); flash("Eliminato definitivamente");
  }
  async function doEmptyTrash() {
    const ok = await askConfirm({
      title: "Svuotare il cestino?",
      description: "Tutti i quiz presenti nel cestino verranno eliminati in modo definitivo.",
      confirmLabel: "Svuota cestino",
      tone: "danger",
    });
    if (!ok) return;
    const n = await emptyTrash(activeId); setTrashList([]); setShowTrash(false); refresh(); flash(`Cestino svuotato (${n})`);
  }

  /* ---- rinomina/ricolora spazio ---- */
  async function renameSpace(patch) {
    await updateSpace(activeId, patch);
    setSpaces(await listSpaces());
    flash("Spazio aggiornato");
  }

  /* ---- persistenza (silenziosa, senza allarmismi) ---- */
  const tryPersist = useCallback(async (announce) => {
    const ok = await requestPersistence().catch(() => false);
    setStorage(await storageInfo().catch(() => null));
    if (announce) flash(ok ? "Dati protetti 🔒" : "Scarica un backup per la massima sicurezza 💾");
    return ok;
  }, [flash]);

  /* ---- Guardian: cartella di backup reale + auto-riparazione ---- */
  async function doConnectFolder() {
    try {
      const name = await connectBackupFolder();
      setGuard(getGuardianState());
      flash(`Cartella "${name}" collegata: backup automatici attivi 🛡`);
    } catch (e) {
      if (e?.name !== "AbortError") flash(e?.message || "Impossibile collegare la cartella");
    }
  }
  async function doReauthFolder() {
    const ok = await reauthorizeFolder().catch(() => false);
    setGuard(getGuardianState());
    flash(ok ? "Backup su cartella riattivati 🛡" : "Permesso non concesso");
  }
  async function doDisconnectFolder() {
    await disconnectBackupFolder().catch(() => {});
    setGuard(getGuardianState());
    flash("Cartella di backup scollegata");
  }
  async function doRecovery() {
    try {
      const r = await restoreFromReplica();
      setRecovery(null);
      setSpaces(await listSpaces());
      await refresh();
      flash(`Ripristinati ${r.quizzes} quiz da ${r.spaces} spazi 💠`);
    } catch (e) {
      flash(e?.message || "Ripristino fallito");
    }
  }

  /* ---- backup COMPLETO (tutti gli spazi) ---- */
  async function doFullExport() {
    const data = await exportEverything();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quizhub-backup-completo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href); flash("Backup completo scaricato ⤓");
  }

  /* ---- cartelle ---- */
  function selectPath(p) {
    setSel(p);
    if (typeof p === "string" && p !== "__all__" && p !== "__none__") {
      setExpanded((e) => { const n = new Set(e); ancestors(p).forEach((a) => n.add(a)); return n; });
    }
  }
  function toggleExpand(p) {
    setExpanded((e) => { const n = new Set(e); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  async function newFolder(parentPath) {
    const name = await askInput({
      title: parentPath ? "Nuova sottocartella" : "Nuova cartella",
      description: parentPath ? `La nuova cartella verra creata dentro "${parentPath}".` : "Crea una cartella nella libreria corrente.",
      label: "Nome cartella",
      placeholder: "es. Meccanica",
      submitLabel: "Crea cartella",
    });
    if (!name || !name.trim()) return;
    const path = normPath((parentPath ? parentPath + "/" : "") + name);
    await addFolder(activeId, path);
    await refresh();
    setExpanded((e) => { const n = new Set(e); ancestors(path).forEach((a) => n.add(a)); return n; });
    flash("Cartella creata");
  }
  async function doRenameFolder(path) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const cur = path.slice(path.lastIndexOf("/") + 1);
    const name = await askInput({
      title: "Rinomina cartella",
      description: `Aggiorna il nome di "${cur}" mantenendo intatta la struttura interna.`,
      label: "Nuovo nome",
      initialValue: cur,
      placeholder: "Nuovo nome cartella",
      submitLabel: "Rinomina",
    });
    if (!name || !name.trim() || name.trim() === cur) return;
    const next = normPath((parent ? parent + "/" : "") + name);
    await renameFolder(activeId, path, next);
    if (sel === path || (typeof sel === "string" && sel.startsWith(path + "/"))) setSel(next + sel.slice(path.length));
    await refresh(); flash("Cartella rinominata");
  }
  async function doDeleteFolder(path) {
    const ok = await askConfirm({
      title: "Eliminare questa cartella?",
      description: `I quiz contenuti in "${path}" torneranno nella cartella superiore.`,
      confirmLabel: "Elimina cartella",
      tone: "danger",
    });
    if (!ok) return;
    await deleteFolder(activeId, path);
    if (sel === path || (typeof sel === "string" && sel.startsWith(path + "/"))) setSel("__all__");
    await refresh(); flash("Cartella eliminata");
  }
  async function dropQuizInto(quizId, path) {
    setDropPath(null);
    await moveQuizToFolder(activeId, quizId, path === "__none__" ? "" : path);
    await refresh(); flash("Quiz spostato");
  }

  /* ---- spazi / vault ---- */
  async function onCreateSpace({ name, color, passphrase }) {
    const space = await createSpace({ name, color, owner: session?.user?.email || "local", vault: null });
    if (passphrase) {
      const vault = await createVault(passphrase);
      space.vault = vault; await putSpace(space);
      const key = await unlockVault(passphrase, vault); setVaultKey(space.id, key);
    }
    setSpaces(await listSpaces()); setActiveId(space.id); setShowSpaceDlg(false);
    flash(passphrase ? "Spazio cifrato creato 🔒" : "Spazio creato");
  }
  async function doUnlock(passphrase) {
    try {
      const key = await unlockVault(passphrase, unlockFor.vault);
      setVaultKey(unlockFor.id, key);
      const sid = unlockFor.id; setUnlockFor(null); setSpaces((s) => [...s]); refresh(sid); flash("Vault sbloccato 🔓");
    } catch (e) { flash(e.message || "Passphrase errata"); }
  }
  async function onDeleteSpace(id) {
    const ok = await askConfirm({
      title: "Eliminare questo spazio?",
      description: "Tutti i quiz dello spazio verranno rimossi in modo irreversibile.",
      confirmLabel: "Elimina spazio",
      tone: "danger",
    });
    if (!ok) return;
    await deleteSpace(id); const s = await listSpaces();
    setSpaces(s); setActiveId(s[0].id); setShowManage(false); flash("Spazio eliminato");
  }

  /* ---- export / import / sync ---- */
  async function doExport() {
    if (locked) return flash("Sblocca lo spazio per esportare");
    const data = await exportSpace(activeId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quizhub-${(activeSpace?.name || "spazio").replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click(); URL.revokeObjectURL(a.href); flash("Backup esportato");
  }
  async function doImport(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format === "quizhub-os-full") {
        const r = await importEverything(payload);
        setSpaces(await listSpaces());
        refresh();
        flash(`Backup ripristinato: ${r.spaces} spazi, ${r.quizzes} quiz`);
      } else {
        const n = await importIntoSpace(activeId, payload);
        refresh();
        flash(`${n} quiz importati`);
      }
    } catch { flash("File non valido"); }
  }
  async function doSync(dir) {
    if (locked) return flash("Sblocca lo spazio per sincronizzare");
    setSyncing(true);
    try {
      const r = dir === "push" ? await pushSpace(activeId) : await pullSpace(activeId);
      if (r.state === SYNC_STATES.UNCONFIGURED) flash("Sync cloud non configurato (KV)");
      else if (r.state === SYNC_STATES.UNAUTHORIZED) flash("Accedi con Google per il sync");
      else if (r.state === SYNC_STATES.ERROR) flash("Errore di sync");
      else { if (dir === "pull") await refresh(); flash(dir === "push" ? "Caricato nel cloud ☁︎" : `Scaricati ${r.imported ?? 0} quiz`); }
    } finally { setSyncing(false); }
  }

  /* ---- palette ---- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Quando l'app viene installata (PWA), i browser concedono la persistenza: ritenta.
  useEffect(() => {
    const onInstalled = () => tryPersist(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [tryPersist]);

  /* ---- derivati: albero cartelle + conteggi ---- */
  const allPaths = useMemo(() => {
    const set = new Set(folderPaths);
    (quizzes || []).forEach((x) => { if (x.folder) ancestors(x.folder).forEach((a) => set.add(a)); });
    return set;
  }, [folderPaths, quizzes]);

  const counts = useMemo(() => {
    const m = new Map();
    (quizzes || []).forEach((x) => { if (x.folder) ancestors(x.folder).forEach((a) => m.set(a, (m.get(a) || 0) + 1)); });
    return m;
  }, [quizzes]);

  const tree = useMemo(() => {
    const root = { name: "", path: "", children: new Map() };
    Array.from(allPaths).sort().forEach((p) => {
      const parts = p.split("/");
      let node = root; let acc = "";
      for (const part of parts) {
        acc = acc ? acc + "/" + part : part;
        if (!node.children.has(part)) node.children.set(part, { name: part, path: acc, children: new Map() });
        node = node.children.get(part);
      }
    });
    return root;
  }, [allPaths]);

  const uncategorized = useMemo(() => (quizzes || []).filter((x) => !x.folder).length, [quizzes]);

  const filtered = useMemo(() => {
    if (!quizzes) return [];
    const term = q.trim().toLowerCase();
    return quizzes.filter((x) => {
      if (favOnly && !x.favorite) return false;
      if (sel === "__none__" && x.folder) return false;
      if (sel !== "__all__" && sel !== "__none__") {
        if (!(x.folder === sel || (x.folder && x.folder.startsWith(sel + "/")))) return false;
      }
      if (term) {
        const hay = (x.name + " " + (x.note || "") + " " + (x.folder || "") + " " + (x.tags || []).join(" ")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [quizzes, q, sel, favOnly]);

  const crumbs = typeof sel === "string" && sel !== "__all__" && sel !== "__none__" ? ancestors(sel) : [];

  if (spaces === null) return <div className="center-load"><div className="spinner" /></div>;

  return (
    <div className="os">
      <div className="menubar">
        <div className="brand">
          <span className="logo">QH</span>
          <span className="name">QuizHub<em> OS</em></span>
          <span className="os-tag">v3.0.1 · local-first</span>
        </div>
        <span className="spacer" />
        <span className="clock">{clock}</span>
        <button className="iconbtn" title="Cerca / comandi (⌘K)" aria-label="Cerca o apri i comandi" onClick={() => setPalette(true)}><Search /></button>
        <button className="iconbtn" title="Guida / esplora" aria-label="Apri guida" onClick={() => setShowExplore(true)}><HelpCircle /></button>
        <button className="iconbtn" title="Aspetto & temi" aria-label="Personalizza aspetto" onClick={() => setShowAppearance(true)}><PaletteIcon /></button>
        <button className="iconbtn" title="Sync cloud ↑" aria-label="Carica nel cloud" disabled={syncing} onClick={() => doSync("push")}><CloudUpload /></button>
        {session?.user ? (
          <button className="iconbtn" title={`${session.user.email} — esci`} onClick={logout}
            style={{ background: spineColor(session.user.email), color: "#fff" }}>
            {initials(session.user.name || session.user.email)}
          </button>
        ) : LOGIN_CONFIGURED && session === null ? (
          <button className="iconbtn" title="Accedi con Google" aria-label="Accedi con Google" onClick={() => router.push("/login")}><LogIn /></button>
        ) : null}
      </div>

      <div className="layout">
        <div className="dock">
          {spaces.map((s) => (
            <button key={s.id} className={"spaceicon" + (s.id === activeId ? " on" : "")}
              style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`, color: s.color }} title={s.name}
              onClick={() => { setActiveId(s.id); setSel("__all__"); setQ(""); setFavOnly(false); }}>
              <span style={{ color: "#fff" }}>{initials(s.name)}</span>
              {s.vault && <span className="lock">{hasVaultKey(s.id) ? "🔓" : "🔒"}</span>}
            </button>
          ))}
          <button className="add" title="Nuovo spazio" aria-label="Nuovo spazio" onClick={() => setShowSpaceDlg(true)}><Plus /></button>
        </div>

        <main className="main">
          <div className="hero">
            <div>
              <h1>{activeSpace?.name || "Spazio"}</h1>
              <div className="sub">
                <span>{locked ? "Spazio cifrato — bloccato" : "Libreria quiz · esami · presentazioni"}</span>
                {activeSpace?.vault && <span className="pill"><Lock /> vault cifrato</span>}
                {activeSpace?.owner && activeSpace.owner !== "local" && <span className="pill">{activeSpace.owner}</span>}
                {storage && storage.supported && (
                  <span className="pill" style={{ cursor: "pointer" }}
                    title="Protezione dei dati: repliche automatiche multi-livello" onClick={() => setShowProtect(true)}>
                    <ShieldCheck /> {guard?.folder?.connected && guard?.folder?.permission === "granted"
                      ? "guardian attivo"
                      : storage.persisted ? "guardian" : "proteggi i dati"}
                  </span>
                )}
              </div>
            </div>
            {!locked && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn subtle sm" onClick={() => setShowManage(true)}><Settings2 /> Gestisci</button>
                <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload /> Carica quiz</button>
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept=".html,.htm,text/html" multiple hidden
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          <input ref={importRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { if (e.target.files?.[0]) doImport(e.target.files[0]); e.target.value = ""; }} />

          {locked ? (
            <div className="empty">
              <div className="orb"><Lock /></div>
              <p className="big">Spazio protetto</p>
              <p>Questo spazio è cifrato end-to-end sul dispositivo. Inserisci la passphrase per sbloccarlo.</p>
              <button className="btn primary" onClick={() => setUnlockFor(activeSpace)}>Sblocca vault</button>
            </div>
          ) : quizzes === null ? (
            <div className="center-load"><div className="spinner" /></div>
          ) : quizzes.length === 0 && folderPaths.length === 0 ? (
            <div className={"dropzone" + (drag ? " drag" : "")}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}>
              <div className="empty">
                <div className="orb"><Upload /></div>
                <p className="big">La libreria è vuota</p>
                <p>Carica gli HTML dei tuoi quiz, esami o presentazioni (es. <code>esame_fisica.html</code>). Restano su questo dispositivo e si aprono anche offline, in una finestra isolata e sicura.</p>
                <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload /> Carica il primo quiz</button>
                <p className="hint">…oppure trascina qui i file .html</p>
              </div>
            </div>
          ) : (
            <>
              {sel === "__all__" && !q.trim() && !favOnly && (
                <Dashboard
                  spaceName={activeSpace?.name || "Spazio"}
                  quizzes={quizzes}
                  stats={stats}
                  foldersCount={allPaths.size}
                  onOpen={(id) => router.push(`/run/${id}`)}
                  onUpload={() => fileRef.current?.click()}
                />
              )}
              {stats && stats.count > 0 && !(sel === "__all__" && !q.trim() && !favOnly) && (
                <div className="stats">
                  <div className="stat"><div className="k">Quiz</div><div className="v">{stats.count}</div></div>
                  <div className="stat"><div className="k">Preferiti</div><div className="v">{stats.favorites}</div></div>
                  <div className="stat"><div className="k">Cartelle</div><div className="v">{allPaths.size}</div></div>
                  <div className="stat"><div className="k">Spazio usato</div><div className="v">{fmtSize(stats.totalBytes).split(" ")[0]}<small> {fmtSize(stats.totalBytes).split(" ")[1]}</small></div></div>
                </div>
              )}

              <div className="workspace">
                {/* pannello cartelle */}
                <aside className="folderpanel">
                  <div className="fp-head">
                    <h4>Cartelle</h4>
                    <button className="iconbtn" style={{ width: 28, height: 28 }} title="Nuova cartella" aria-label="Nuova cartella"
                      onClick={() => newFolder(typeof sel === "string" && sel !== "__all__" && sel !== "__none__" ? sel : "")}><Plus /></button>
                  </div>
                  <div className="tree">
                    <div className={"tnode" + (sel === "__all__" ? " on" : "") + (dropPath === "__all__" ? " drop" : "")}
                      onClick={() => setSel("__all__")}
                      onDragOver={(e) => { e.preventDefault(); setDropPath("__all__"); }}
                      onDragLeave={() => setDropPath((d) => (d === "__all__" ? null : d))}
                      onDrop={(e) => { const id = e.dataTransfer.getData("text/quizid"); if (id) dropQuizInto(id, "__none__"); }}>
                      <span className="caret" /> <span className="fic"><FolderOpen /></span>
                      <span className="lbl">Tutti</span><span className="cnt">{quizzes.length}</span>
                    </div>
                    <FolderTree node={tree} depth={0} sel={sel} expanded={expanded} counts={counts} dropPath={dropPath}
                      onSelect={selectPath} onToggle={toggleExpand} onNew={newFolder} onRename={doRenameFolder} onDelete={doDeleteFolder}
                      setDropPath={setDropPath} onDropQuiz={dropQuizInto} />
                    {uncategorized > 0 && (
                      <div className={"tnode" + (sel === "__none__" ? " on" : "") + (dropPath === "__none__" ? " drop" : "")}
                        onClick={() => setSel("__none__")}
                        onDragOver={(e) => { e.preventDefault(); setDropPath("__none__"); }}
                        onDragLeave={() => setDropPath((d) => (d === "__none__" ? null : d))}
                        onDrop={(e) => { const id = e.dataTransfer.getData("text/quizid"); if (id) dropQuizInto(id, "__none__"); }}>
                        <span className="caret" /> <span className="fic"><FolderIcon /></span>
                        <span className="lbl">Senza cartella</span><span className="cnt">{uncategorized}</span>
                      </div>
                    )}
                  </div>
                </aside>

                {/* libreria */}
                <div>
                  <div className="controls">
                    <div className="search">
                      <span className="mag"><Search /></span>
                      <input type="search" placeholder="Cerca per nome, nota, cartella o tag…" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <button className={"chip star" + (favOnly ? " on" : "")} onClick={() => setFavOnly((v) => !v)}><Star fill={favOnly ? "currentColor" : "none"} /> Preferiti</button>
                    <button className="iconbtn" title="Esporta questo spazio" aria-label="Esporta questo spazio" onClick={doExport}><Download /></button>
                    <button className="iconbtn" title="Importa" aria-label="Importa backup" onClick={() => importRef.current?.click()}><ImportIcon /></button>
                    <button className="iconbtn" title={`Cestino (${trash})`} onClick={openTrash} style={trash ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>
                      <Trash2 />{trash ? <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", marginLeft: 2 }}>{trash}</span> : null}
                    </button>
                  </div>

                  {crumbs.length > 0 && (
                    <div className="crumbs">
                      <a onClick={() => setSel("__all__")}>Tutti</a>
                      {crumbs.map((c) => (
                        <span key={c}><span className="sep">/</span> <a onClick={() => selectPath(c)}>{c.slice(c.lastIndexOf("/") + 1)}</a></span>
                      ))}
                    </div>
                  )}

                  {filtered.length === 0 ? (
                    <div className="empty">
                      <p className="big">Nessun quiz qui</p>
                      <p>{sel === "__all__" ? "Nessun quiz corrisponde ai filtri." : "Questa cartella è vuota. Trascina qui un quiz o caricane uno nuovo."}</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="btn subtle" onClick={() => { setQ(""); setSel("__all__"); setFavOnly(false); }}>Azzera filtri</button>
                        <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload /> Carica quiz</button>
                      </div>
                    </div>
                  ) : (
                    <section className={"grid dropzone" + (drag ? " drag" : "")}
                      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); } else setDrag(false); }}>
                      {filtered.map((x, i) => {
                        const col = spineColor(x.folder || x.name);
                        return (
                          <article className="qcard" key={x.id} draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/quizid", x.id); e.dataTransfer.effectAllowed = "move"; }}
                            style={{ animationDelay: Math.min(i * 30, 300) + "ms", "--spine": col }}>
                            <div className="glowline" />
                            <div className="body">
                              <div className="qtop">
                                <div style={{ minWidth: 0 }}>
                                  <div className="qtitle">{x.name}</div>
                                  <div className="qcat"><span className="dot" style={{ background: col }} />{x.folder || "senza cartella"}</div>
                                </div>
                                <button className={"iconbtn" + (x.favorite ? " on" : "")} title="Preferito" aria-label={x.favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"} onClick={() => toggleFav(x)}>
                                  <Star fill={x.favorite ? "currentColor" : "none"} />
                                </button>
                              </div>
                              {x.note ? <div className="qnote">{x.note}</div> : null}
                              {x.tags?.length ? <div className="qtags">{x.tags.map((t) => <span className="qtag" key={t}>#{t}</span>)}</div> : null}
                              <div className="qmeta">
                                <span>{fmtSize(x.size)}</span><span>·</span>
                                <span>agg. {fmtDate(x.updatedAt)}</span>
                                {x.openCount ? <><span>·</span><span>{x.openCount}× aperto</span></> : null}
                                {x.encrypted ? <><span>·</span><span className="enc"><Lock /></span></> : null}
                              </div>
                              <div className="qactions">
                                <button className="btn primary sm open" onClick={() => router.push(`/run/${x.id}`)}><Play /> Apri</button>
                                <button className="iconbtn" title="Modifica" aria-label="Modifica quiz" onClick={() => setEditing(x)}><MoreVertical /></button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {editing && <EditSheet quiz={editing} folders={Array.from(allPaths).sort()} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => removeQuiz(editing)} />}
      {showSpaceDlg && <SpaceDialog onClose={() => setShowSpaceDlg(false)} onCreate={onCreateSpace} />}
      {unlockFor && <UnlockDialog space={unlockFor} onClose={() => setUnlockFor(null)} onUnlock={doUnlock} />}
      {showManage && activeSpace && (
        <ManageDialog space={activeSpace} storage={storage} trash={trash} onClose={() => setShowManage(false)}
          onRenameSpace={renameSpace} onPersist={() => { setShowManage(false); setShowProtect(true); }}
          onExport={doExport} onImport={() => importRef.current?.click()}
          onFullExport={doFullExport}
          onSyncPush={() => doSync("push")} onSyncPull={() => doSync("pull")}
          onTrash={() => { setShowManage(false); openTrash(); }}
          onLock={() => { clearVaultKey(activeSpace.id); setSpaces((s) => [...s]); setShowManage(false); flash("Vault bloccato 🔒"); }}
          onDelete={() => onDeleteSpace(activeSpace.id)} />
      )}
      {showTrash && (
        <TrashDialog items={trashList} onClose={() => setShowTrash(false)}
          onRestore={doRestore} onPurge={doPurge} onEmpty={doEmptyTrash} />
      )}
      {showAppearance && <AppearanceDialog look={look} onApply={applyLook} onClose={() => setShowAppearance(false)} />}
      {showProtect && (
        <DataProtectionDialog storage={storage} guard={guard} cloud={!!session?.user}
          onRetry={() => tryPersist(true)}
          onBackup={() => { setShowProtect(false); doFullExport(); }}
          onConnectFolder={doConnectFolder} onReauthFolder={doReauthFolder} onDisconnectFolder={doDisconnectFolder}
          onClose={() => setShowProtect(false)} />
      )}
      {recovery && (
        <RecoveryDialog recovery={recovery} onRestore={doRecovery} onClose={() => setRecovery(null)} />
      )}
      {showExplore && (
        <ExploreDialog onClose={dismissExplore}
          onUpload={() => { dismissExplore(); fileRef.current?.click(); }}
          onNewSpace={() => { dismissExplore(); setShowSpaceDlg(true); }}
          onAppearance={() => { dismissExplore(); setShowAppearance(true); }} />
      )}
      {palette && (
        <Palette quizzes={quizzes || []} spaces={spaces} onClose={() => setPalette(false)}
          onOpenQuiz={(id) => { setPalette(false); router.push(`/run/${id}`); }}
          onSwitchSpace={(id) => { setPalette(false); setActiveId(id); }}
          onCmd={(c) => { setPalette(false); if (c === "upload") fileRef.current?.click(); else if (c === "appearance") setShowAppearance(true); else if (c === "guide") setShowExplore(true); else if (c === "newspace") setShowSpaceDlg(true); else if (c === "export") doExport(); else if (c === "newfolder") newFolder(""); }} />
      )}
      {confirmDlg && (
        <ConfirmDialog
          title={confirmDlg.title}
          description={confirmDlg.description}
          confirmLabel={confirmDlg.confirmLabel}
          tone={confirmDlg.tone}
          onClose={() => { confirmDlg.resolve(false); setConfirmDlg(null); }}
          onConfirm={() => { confirmDlg.resolve(true); setConfirmDlg(null); }}
        />
      )}
      {inputDlg && (
        <InputDialog
          title={inputDlg.title}
          description={inputDlg.description}
          label={inputDlg.label}
          placeholder={inputDlg.placeholder}
          initialValue={inputDlg.initialValue}
          submitLabel={inputDlg.submitLabel}
          onClose={() => { inputDlg.resolve(null); setInputDlg(null); }}
          onSubmit={(value) => { inputDlg.resolve(value); setInputDlg(null); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- albero cartelle ---------------- */
function FolderTree({ node, depth, sel, expanded, counts, dropPath, onSelect, onToggle, onNew, onRename, onDelete, setDropPath, onDropQuiz }) {
  const kids = Array.from(node.children.values());
  if (!kids.length) return null;
  return (
    <div className={depth === 0 ? "tree" : "tchildren"}>
      {kids.map((child) => {
        const hasKids = child.children.size > 0;
        const open = expanded.has(child.path);
        const on = sel === child.path;
        return (
          <div key={child.path}>
            <div className={"tnode" + (on ? " on" : "") + (dropPath === child.path ? " drop" : "")}
              onClick={() => onSelect(child.path)}
              onDragOver={(e) => { e.preventDefault(); setDropPath(child.path); }}
              onDragLeave={() => setDropPath((d) => (d === child.path ? null : d))}
              onDrop={(e) => { const id = e.dataTransfer.getData("text/quizid"); if (id) onDropQuiz(id, child.path); }}>
              <span className={"caret" + (open ? " open" : "")} onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle(child.path); }}>{hasKids ? <ChevronRight /> : null}</span>
              <span className="fic">{open && hasKids ? <FolderOpen /> : <FolderIcon />}</span>
              <span className="lbl">{child.name}</span>
              <span className="cnt">{counts.get(child.path) || 0}</span>
              <span className="mini" title="Sottocartella" onClick={(e) => { e.stopPropagation(); onNew(child.path); }}><Plus /></span>
              <span className="mini" title="Rinomina" onClick={(e) => { e.stopPropagation(); onRename(child.path); }}><Pencil /></span>
              <span className="mini" title="Elimina" onClick={(e) => { e.stopPropagation(); onDelete(child.path); }}><Trash2 /></span>
            </div>
            {open && hasKids && (
              <FolderTree node={child} depth={depth + 1} sel={sel} expanded={expanded} counts={counts} dropPath={dropPath}
                onSelect={onSelect} onToggle={onToggle} onNew={onNew} onRename={onRename} onDelete={onDelete} setDropPath={setDropPath} onDropQuiz={onDropQuiz} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- dialoghi ---------------- */
function EditSheet({ quiz, folders, onClose, onSave, onDelete }) {
  const [name, setName] = useState(quiz.name);
  const [folder, setFolder] = useState(quiz.folder || "");
  const [note, setNote] = useState(quiz.note || "");
  const [tags, setTags] = useState((quiz.tags || []).join(", "));
  const [net, setNet] = useState(!!quiz.net);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Modifica quiz</h3>
        <div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Cartella (usa “/” per le sottocartelle)</label>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="es. Fisica/Meccanica/Cinematica" list="fdl" />
          <datalist id="fdl">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <div className="field"><label>Tag (separati da virgola)</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="analisi, capitolo-3, ripasso" /></div>
        <div className="field"><label>Nota</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa copre, quando ripassarlo…" /></div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={net} onChange={(e) => setNet(e.target.checked)} style={{ width: "auto" }} />
            🌐 Consenti risorse esterne (immagini/font da Internet)
          </label>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            Di default ogni quiz gira completamente offline. Attiva solo se il quiz usa immagini o font online: fetch e script esterni restano comunque bloccati.
          </p>
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onSave({ name: name.trim() || quiz.name, folder: folder.trim().replace(/^\/+|\/+$/g, ""), note, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), net })}>Salva</button>
        </div>
        <div className="row"><button className="btn danger" onClick={onDelete}>🗑 Sposta nel cestino</button></div>
      </div>
    </div>
  );
}

function SpaceDialog({ onClose, onCreate }) {
  const COLORS = ["#5b8cff", "#21e6c1", "#ffcf5c", "#7c5cff", "#ff5d73", "#34e39a", "#ff8ac4"];
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[3]);
  const [enc, setEnc] = useState(false);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Nuovo spazio</h3>
        <p className="lead">Uno spazio separato e isolato — la tua "scrivania" di quiz. Puoi cifrarlo con una passphrase.</p>
        <div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Sessione estiva, Anatomia…" autoFocus /></div>
        <div className="field"><label>Colore</label>
          <div className="swatches">{COLORS.map((c) => <span key={c} className={"swatch" + (c === color ? " on" : "")} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </div>
        <div className="field">
          <label><input type="checkbox" checked={enc} onChange={(e) => setEnc(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />Cifra questo spazio (vault) 🔒</label>
          {enc && <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase (non recuperabile!)" style={{ marginTop: 8 }} />}
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy || (enc && pass.length < 4)}
            onClick={async () => { setBusy(true); try { await onCreate({ name, color, passphrase: enc ? pass : null }); } finally { setBusy(false); } }}>
            {busy ? "Creo…" : "Crea spazio"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockDialog({ space, onClose, onUnlock }) {
  const [pass, setPass] = useState("");
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Sblocca “{space.name}” 🔒</h3>
        <p className="lead">Cifratura AES-256 end-to-end. La passphrase resta solo in memoria.</p>
        <div className="field"><label>Passphrase</label>
          <input type="password" value={pass} autoFocus onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onUnlock(pass)} placeholder="La tua passphrase" />
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onUnlock(pass)}>Sblocca</button>
        </div>
      </div>
    </div>
  );
}

function ManageDialog({ space, storage, trash, onClose, onRenameSpace, onPersist, onExport, onImport, onFullExport, onSyncPush, onSyncPull, onTrash, onLock, onDelete }) {
  const COLORS = ["#5b8cff", "#21e6c1", "#ffcf5c", "#7c5cff", "#ff5d73", "#34e39a", "#ff8ac4"];
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState(space.color || COLORS[0]);
  const dirty = name.trim() !== space.name || color !== space.color;
  const pct = storage?.quota ? Math.min(100, Math.round((storage.usage / storage.quota) * 100)) : 0;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "86vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3>Gestisci spazio</h3>

        <div className="field"><label>Nome spazio</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Colore</label>
          <div className="swatches">{COLORS.map((c) => <span key={c} className={"swatch" + (c === color ? " on" : "")} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        </div>
        <div className="row"><button className="btn primary" disabled={!dirty} onClick={() => onRenameSpace({ name: name.trim() || space.name, color })}>Salva modifiche</button></div>

        <hr style={{ border: 0, borderTop: "1px solid var(--stroke)", margin: "16px 0" }} />

        <label style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Sicurezza dati</label>
        <p className="lead" style={{ margin: "6px 0 10px" }}>
          {storage?.persisted
            ? "✅ Storage persistente: il browser non cancellerà i tuoi dati."
            : "I dati sono salvati in questo browser. Per la massima sicurezza tieni un backup: scopri come."}
          {storage?.quota ? ` · ${fmtSize(storage.usage)} usati (${pct}%).` : ""}
        </p>
        {!storage?.persisted && <div className="row"><button className="btn ghost" onClick={onPersist}>🛡 Proteggi i dati</button></div>}

        <label style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Backup & ripristino</label>
        <div className="row" style={{ marginTop: 8 }}><button className="btn ghost" onClick={onExport}>⤓ Esporta questo spazio</button><button className="btn ghost" onClick={onImport}>⤒ Importa / Ripristina</button></div>
        <div className="row"><button className="btn ghost" onClick={onFullExport}>💾 Backup COMPLETO (tutti gli spazi)</button></div>
        <div className="row"><button className="btn ghost" onClick={onSyncPush}>☁︎ Carica nel cloud</button><button className="btn ghost" onClick={onSyncPull}>⇩ Scarica dal cloud</button></div>

        <label style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Manutenzione</label>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn subtle" onClick={onTrash}>🗑 Cestino{trash ? ` (${trash})` : ""}</button>
          {space.vault && <button className="btn subtle" onClick={onLock}>🔒 Blocca vault</button>}
        </div>
        {space.id !== "local" && <div className="row"><button className="btn danger" onClick={onDelete}>Elimina spazio e tutto il contenuto</button></div>}
        <div className="row"><button className="btn subtle" onClick={onClose}>Chiudi</button></div>
      </div>
    </div>
  );
}

function TrashDialog({ items, onClose, onRestore, onPurge, onEmpty }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "86vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3>Cestino 🗑</h3>
        <p className="lead">I quiz eliminati restano qui. Puoi ripristinarli o eliminarli per sempre.</p>
        {items.length === 0 ? (
          <p className="count" style={{ padding: "12px 0" }}>Il cestino è vuoto.</p>
        ) : (
          <div className="pallist" style={{ maxHeight: "52vh" }}>
            {items.map((x) => (
              <div key={x.id} className="palitem" style={{ cursor: "default" }}>
                <span className="ic">🗑</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
                  <div className="subt">{x.folder || "senza cartella"}{x.encrypted ? " · 🔒" : ""}</div>
                </div>
                <button className="btn subtle sm" onClick={() => onRestore(x.id)}>Ripristina</button>
                <button className="btn danger sm" onClick={() => onPurge(x.id)}>Elimina</button>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          {items.length > 0 && <button className="btn danger" onClick={onEmpty}>Svuota cestino</button>}
          <button className="btn subtle" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel = "Conferma", tone = "primary", onClose, onConfirm }) {
  const confirmClass = tone === "danger" ? "btn danger" : "btn primary";
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {description ? <p className="lead">{description}</p> : null}
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className={confirmClass} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function InputDialog({ title, description, label, placeholder, initialValue = "", submitLabel = "Continua", onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {description ? <p className="lead">{description}</p> : null}
        <div className="field">
          <label>{label}</label>
          <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit(value);
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onSubmit(value)}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

function fmtTime(ts) {
  if (!ts) return null;
  try { return new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); } catch { return null; }
}

function DataProtectionDialog({ storage, guard, cloud, onRetry, onBackup, onConnectFolder, onReauthFolder, onDisconnectFolder, onClose }) {
  const persisted = !!storage?.persisted;
  const pct = storage?.quota ? Math.min(100, Math.round((storage.usage / storage.quota) * 100)) : 0;
  const opfs = guard?.opfs;
  const folder = guard?.folder;
  const folderActive = folder?.connected && folder?.permission === "granted";

  // Punteggio: L1 sempre attivo; +persistenza; +replica OPFS; +cartella; +cloud
  const layers = [
    { on: true, ic: "💽", name: "Database del browser", state: persisted ? "attivo · persistente" : "attivo",
      desc: persisted
        ? "IndexedDB protetto dallo sfratto automatico."
        : "Il browser potrebbe liberare spazio in casi estremi: gli altri livelli ti coprono.",
      action: !persisted && <button className="btn ghost sm" onClick={onRetry}>🔄 Richiedi persistenza</button> },
    { on: !!opfs?.supported, ic: "🧬", name: "Replica automatica (doppio slot)",
      state: !opfs?.supported ? "non supportata da questo browser"
        : opfs.lastSavedAt ? `attiva · gen. ${opfs.generation} · ${fmtTime(opfs.lastSavedAt)}` : "attiva · in attesa della prima modifica",
      desc: opfs?.supported
        ? "Copia integrale con checksum SHA-256 in un'area separata: se il database si corrompe, QuizHub la rileva e propone il ripristino da solo."
        : "Su questo browser la replica interna non è disponibile: usa la cartella di backup o i backup manuali." },
    { on: !!folderActive, ic: "📂", name: "Cartella sul disco (fuori dal browser)",
      state: !folder?.supported ? "serve Chrome o Edge"
        : !folder?.connected ? "non collegata"
        : folder.permission !== "granted" ? `collegata a “${folder.name}” · da riattivare`
        : `attiva · “${folder.name}”${folder.lastSavedAt ? " · " + fmtTime(folder.lastSavedAt) : ""}`,
      desc: "Il livello più forte: ogni modifica scrive un file vero sul tuo PC (+ copie giornaliere, ultime 7). Sopravvive anche a “cancella dati di navigazione”.",
      action: folder?.supported && (
        !folder?.connected
          ? <button className="btn ghost sm" onClick={onConnectFolder}>📂 Collega una cartella</button>
          : folder.permission !== "granted"
            ? <span style={{ display: "inline-flex", gap: 6 }}>
                <button className="btn ghost sm" onClick={onReauthFolder}>🔓 Riattiva</button>
                <button className="btn subtle sm" onClick={onDisconnectFolder}>Scollega</button>
              </span>
            : <button className="btn subtle sm" onClick={onDisconnectFolder}>Scollega</button>
      ) },
    { on: !!cloud, ic: "☁︎", name: "Cloud (zero-knowledge)",
      state: cloud ? "account collegato" : "opzionale · accedi per attivarlo",
      desc: "Sync cifrato per portare gli spazi su altri dispositivi. I vault restano illeggibili anche per il server." },
  ];
  const score = layers.filter((l) => l.on).length + (persisted ? 1 : 0);
  const max = 5;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "88vh", overflow: "auto", maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>🛡 Protezione dei dati — Guardian</h3>
        <p className="lead" style={{ marginBottom: 8 }}>
          QuizHub replica i tuoi dati su più livelli indipendenti, in automatico.
          {storage?.quota ? ` ${fmtSize(storage.usage)} usati (${pct}%).` : ""}
        </p>
        <div className="shieldscore" aria-hidden>
          {Array.from({ length: max }).map((_, i) => <i key={i} className={i < score ? "on" : ""} />)}
          <span>{score}/{max}</span>
        </div>

        <div className="layerlist">
          {layers.map((l) => (
            <div className={"layer" + (l.on ? " on" : "")} key={l.name}>
              <div className="lx">{l.ic}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lt">{l.name} <span className={"lstate" + (l.on ? " ok" : "")}>{l.state}</span></div>
                <div className="ld">{l.desc}</div>
                {l.action ? <div style={{ marginTop: 6 }}>{l.action}</div> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={onBackup}>💾 Scarica backup completo</button>
          <button className="btn subtle" onClick={onClose}>Chiudi</button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          I vault restano cifrati (AES-256) in ogni replica: nessun livello vede i contenuti in chiaro.
        </p>
      </div>
    </div>
  );
}

function RecoveryDialog({ recovery, onRestore, onClose }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>💠 Trovata una copia di sicurezza</h3>
        <p className="lead">
          La libreria risulta vuota, ma il Guardian conserva una replica verificata
          del {fmtDate(recovery.savedAt)} con <b>{recovery.quizzes} quiz</b> in {recovery.spaces} spazi.
          Vuoi ripristinarla?
        </p>
        <div className="row">
          <button className="btn primary" onClick={onRestore}>💠 Ripristina tutto</button>
          <button className="btn subtle" onClick={onClose}>Ignora</button>
        </div>
        <p className="hint">Il ripristino non tocca eventuali dati già presenti: aggiunge ciò che manca.</p>
      </div>
    </div>
  );
}

const THEMES = [
  { id: "midnight", name: "Midnight", sw: ["#5b8cff", "#7c5cff", "#0b1120"] },
  { id: "light", name: "Carta", sw: ["#3a5bd9", "#8b5cf6", "#eef1f8"] },
  { id: "aurora", name: "Aurora", sw: ["#21e6c1", "#37b6ff", "#04120f"] },
  { id: "sunset", name: "Sunset", sw: ["#ff7a59", "#ff4d8d", "#160810"] },
  { id: "grape", name: "Grape", sw: ["#a06bff", "#ff5db8", "#0c0518"] },
  { id: "terminal", name: "Terminal", sw: ["#34e39a", "#21e6c1", "#030805"] },
];
const FONTS = [
  { id: "system", name: "Sistema" },
  { id: "serif", name: "Serif" },
  { id: "rounded", name: "Rounded" },
  { id: "mono", name: "Mono" },
];
const BGS = [
  { id: "grid", name: "Griglia" },
  { id: "dots", name: "Punti" },
  { id: "glow", name: "Glow" },
  { id: "plain", name: "Pulito" },
];

function AppearanceDialog({ look, onApply, onClose }) {
  const set = (part, val) => onApply({ ...look, [part]: val });
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "88vh", overflow: "auto", maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>🎨 Aspetto</h3>
        <p className="lead">Personalizza QuizHub: scegli un template, il carattere e lo sfondo. Le modifiche sono immediate e restano salvate su questo dispositivo.</p>

        <div className="app-section">
          <label>Template tema</label>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <div key={t.id} className={"theme-card" + (look.theme === t.id ? " on" : "")} onClick={() => set("theme", t.id)}>
                <div className="swatch-preview" style={{ background: `linear-gradient(135deg, ${t.sw[2]}, ${t.sw[2]})` }}>
                  <i style={{ background: t.sw[0] }} /><i style={{ background: t.sw[1] }} /><i style={{ background: t.sw[2], border: "1px solid rgba(255,255,255,.2)" }} />
                </div>
                <div className="tname">{t.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-section">
          <label>Carattere</label>
          <div className="opt-row">
            {FONTS.map((f) => (
              <button key={f.id} className={"opt" + (look.font === f.id ? " on" : "")} onClick={() => set("font", f.id)}
                style={{ fontFamily: f.id === "serif" ? "ui-serif,Georgia,serif" : f.id === "mono" ? "var(--font-mono)" : f.id === "rounded" ? "ui-rounded,Nunito,system-ui" : "inherit" }}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="app-section">
          <label>Sfondo</label>
          <div className="opt-row">
            {BGS.map((b) => (
              <button key={b.id} className={"opt" + (look.bg === b.id ? " on" : "")} onClick={() => set("bg", b.id)}>{b.name}</button>
            ))}
          </div>
        </div>

        <div className="row">
          <button className="btn subtle" onClick={() => onApply({ theme: "midnight", font: "system", bg: "grid" })}>Ripristina default</button>
          <button className="btn primary" onClick={onClose}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

const EXPLORE_FEATURES = [
  { icon: FolderOpen, ft: "Spazi", fd: "Scrivanie separate e isolate. Crea, rinomina, ricolora dalla dock a sinistra." },
  { icon: FolderIcon, ft: "Cartelle annidate", fd: "Organizza in Materia/Capitolo. Trascina i quiz nelle cartelle." },
  { icon: Upload, ft: "Carica HTML", fd: "Trascina o scegli i tuoi file .html: quiz, esami, slide, flashcard." },
  { icon: Play, ft: "Lettore sicuro", fd: "Ogni quiz gira isolato, in tab multiple, con zoom e schermo intero." },
  { icon: Timer, ft: "Timer d'esame", fd: "Simula l'esame: conto alla rovescia con avvisi giallo/rosso." },
  { icon: Lock, ft: "Vault cifrati", fd: "Proteggi uno spazio con una passphrase (cifratura AES-256 sul device)." },
  { icon: ShieldCheck, ft: "Guardian", fd: "Repliche automatiche multi-livello: anche su una vera cartella del PC. I dati non si perdono." },
  { icon: Download, ft: "Backup & Cestino", fd: "Backup completo, export/import e cestino per recuperare le eliminazioni." },
  { icon: Search, ft: "Command palette", fd: "Premi ⌘K / Ctrl+K per saltare a qualsiasi quiz, spazio o comando." },
];

function ExploreDialog({ onClose, onUpload, onNewSpace, onAppearance }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet explore" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflow: "auto" }}>
        <div className="xhero">
          <div className="xlogo">QH</div>
          <h2>Benvenuto in QuizHub OS</h2>
          <p className="xsub">Il tuo computer nel browser per studiare: carica quiz ed esami HTML e aprili in sicurezza, organizzati come vuoi.</p>
        </div>

        <div className="feature-grid">
          {EXPLORE_FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div className="feature" key={f.ft}>
                <div className="fx"><Icon /></div>
                <div><div className="ft">{f.ft}</div><div className="fd">{f.fd}</div></div>
              </div>
            );
          })}
        </div>

        <div className="kbds">
          <span className="k"><b>⌘K</b> comandi</span>
          <span className="k"><b>▶</b> apri quiz</span>
          <span className="k"><b>★</b> preferiti</span>
          <span className="k"><b>🗑</b> cestino</span>
          <span className="k"><b>🎨</b> temi</span>
        </div>

        <div className="xcta">
          <button className="btn primary" onClick={onUpload}><Upload /> Carica il primo quiz</button>
          <button className="btn ghost" onClick={onNewSpace}><Plus /> Crea uno spazio</button>
          <button className="btn ghost" onClick={onAppearance}><PaletteIcon /> Personalizza</button>
          <button className="btn subtle" onClick={onClose}>Inizia</button>
        </div>
      </div>
    </div>
  );
}

function Palette({ quizzes, spaces, onClose, onOpenQuiz, onSwitchSpace, onCmd }) {
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => {
    const t = term.trim().toLowerCase();
    const cmds = [
      { type: "cmd", id: "upload", ic: "＋", label: "Carica quiz", meta: "azione" },
      { type: "cmd", id: "newfolder", ic: "📁", label: "Nuova cartella", meta: "azione" },
      { type: "cmd", id: "newspace", ic: "◫", label: "Nuovo spazio", meta: "azione" },
      { type: "cmd", id: "export", ic: "⤓", label: "Esporta backup", meta: "azione" },
      { type: "cmd", id: "appearance", ic: "🎨", label: "Aspetto & temi", meta: "azione" },
      { type: "cmd", id: "guide", ic: "？", label: "Guida / esplora", meta: "azione" },
    ];
    const sp = spaces.map((s) => ({ type: "space", id: s.id, ic: "▢", label: s.name, subt: "spazio", meta: "vai" }));
    const qz = quizzes.map((x) => ({ type: "quiz", id: x.id, ic: "▶", label: x.name, subt: x.folder || "quiz", meta: "apri" }));
    const all = [...cmds, ...sp, ...qz];
    if (!t) return all.slice(0, 30);
    return all.filter((i) => (i.label + " " + (i.subt || "")).toLowerCase().includes(t)).slice(0, 30);
  }, [term, quizzes, spaces]);

  function choose(i) {
    if (!i) return;
    if (i.type === "quiz") onOpenQuiz(i.id);
    else if (i.type === "space") onSwitchSpace(i.id);
    else onCmd(i.id);
  }
  return (
    <div className="palette" onClick={onClose}>
      <div className="palbox" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Cerca quiz, spazi o comandi…" value={term}
          onChange={(e) => { setTerm(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
          }} />
        <div className="pallist">
          {items.length === 0 ? <div className="palitem"><span className="subt">Nessun risultato</span></div> :
            items.map((i, idx) => (
              <div key={i.type + i.id} className={"palitem" + (idx === active ? " active" : "")}
                onMouseEnter={() => setActive(idx)} onClick={() => choose(i)}>
                <span className="ic">{i.ic}</span>
                <div><div>{i.label}</div>{i.subt && <div className="subt">{i.subt}</div>}</div>
                <span className="meta">{i.meta}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
