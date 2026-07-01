"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LOCAL_SPACE_ID,
  listSpaces,
  createSpace,
  deleteSpace,
  putSpace,
  listQuizzes,
  patchQuiz,
  deleteQuiz,
  addQuizFromFile,
  spaceStats,
  exportSpace,
  importIntoSpace,
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
  const [theme, setTheme] = useState("dark");
  const [clock, setClock] = useState("");
  const [session, setSession] = useState(undefined);
  const [showSpaceDlg, setShowSpaceDlg] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [unlockFor, setUnlockFor] = useState(null);
  const [palette, setPalette] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const activeSpace = useMemo(() => spaces?.find((s) => s.id === activeId) || null, [spaces, activeId]);
  const locked = !!(activeSpace?.vault && !hasVaultKey(activeId));
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2000); }, []);

  /* ---- bootstrap ---- */
  useEffect(() => {
    (async () => {
      const s = await listSpaces();
      setSpaces(s);
      const saved = await getMeta("activeSpaceId", LOCAL_SPACE_ID);
      setActiveId(s.some((x) => x.id === saved) ? saved : s[0].id);
      const t = typeof localStorage !== "undefined" ? localStorage.getItem("qh-theme") : null;
      setTheme(t === "light" ? "light" : "dark");
    })().catch(() => setSpaces([]));
    fetch("/api/session").then((r) => r.json()).then((s) => setSession(s?.user ? s : null)).catch(() => setSession(null));
  }, []);

  async function logout() {
    if (!confirm("Uscire dall'account? I dati locali restano sul dispositivo.")) return;
    try { await fetch("/api/session", { method: "DELETE" }); } catch {}
    setSession(null);
    flash("Uscito");
  }

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    tick(); const id = setInterval(tick, 15000); return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async (sid = activeId) => {
    const [list, st, fp] = await Promise.all([listQuizzes(sid), spaceStats(sid), getFolders(sid)]);
    setQuizzes(list); setStats(st); setFolderPaths(fp);
  }, [activeId]);

  useEffect(() => {
    if (!spaces) return;
    setQuizzes(null); setSel("__all__");
    setMeta("activeSpaceId", activeId).catch(() => {});
    if (!locked) refresh(activeId).catch(() => setQuizzes([]));
    else { setQuizzes([]); setStats(null); setFolderPaths([]); }
  }, [activeId, spaces, locked, refresh]);

  /* ---- tema ---- */
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("qh-theme", next); } catch {}
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
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
  }

  async function toggleFav(x) { await patchQuiz(x.id, { favorite: !x.favorite }); refresh(); }
  async function saveEdit(patch) {
    await patchQuiz(editing.id, patch);
    if (patch.folder) await addFolder(activeId, patch.folder);
    setEditing(null); refresh(); flash("Salvato");
  }
  async function removeQuiz(x) {
    if (!confirm(`Eliminare "${x.name}"? Non si può annullare.`)) return;
    await deleteQuiz(x.id); setEditing(null); refresh(); flash("Quiz eliminato");
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
    const name = prompt(parentPath ? `Nuova sottocartella dentro "${parentPath}":` : "Nuova cartella:");
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
    const name = prompt("Rinomina cartella:", cur);
    if (!name || !name.trim() || name.trim() === cur) return;
    const next = normPath((parent ? parent + "/" : "") + name);
    await renameFolder(activeId, path, next);
    if (sel === path || (typeof sel === "string" && sel.startsWith(path + "/"))) setSel(next + sel.slice(path.length));
    await refresh(); flash("Cartella rinominata");
  }
  async function doDeleteFolder(path) {
    if (!confirm(`Eliminare la cartella "${path}"? I quiz dentro tornano alla cartella superiore.`)) return;
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
    if (!confirm("Eliminare questo spazio e TUTTI i suoi quiz? Irreversibile.")) return;
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
    try { const payload = JSON.parse(await file.text()); const n = await importIntoSpace(activeId, payload); refresh(); flash(`${n} quiz importati`); }
    catch { flash("Import non valido"); }
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
          <span className="os-tag">v2 · local-first</span>
        </div>
        <span className="spacer" />
        <span className="clock">{clock}</span>
        <button className="iconbtn" title="Cerca / comandi (⌘K)" onClick={() => setPalette(true)}>⌕</button>
        <button className="iconbtn" title="Tema" onClick={toggleTheme}>{theme === "dark" ? "☾" : "☀"}</button>
        <button className="iconbtn" title="Sync cloud ↑" disabled={syncing} onClick={() => doSync("push")}>☁︎</button>
        {session?.user ? (
          <button className="iconbtn" title={`${session.user.email} — esci`} onClick={logout}
            style={{ background: spineColor(session.user.email), color: "#fff" }}>
            {initials(session.user.name || session.user.email)}
          </button>
        ) : LOGIN_CONFIGURED && session === null ? (
          <button className="iconbtn" title="Accedi con Google" onClick={() => (window.location.href = "/login")}>⏻</button>
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
          <button className="add" title="Nuovo spazio" onClick={() => setShowSpaceDlg(true)}>＋</button>
        </div>

        <main className="main">
          <div className="hero">
            <div>
              <h1>{activeSpace?.name || "Spazio"}</h1>
              <div className="sub">
                <span>{locked ? "Spazio cifrato — bloccato" : "Libreria quiz · esami · presentazioni"}</span>
                {activeSpace?.vault && <span className="pill">🔒 vault cifrato</span>}
                {activeSpace?.owner && activeSpace.owner !== "local" && <span className="pill">{activeSpace.owner}</span>}
              </div>
            </div>
            {!locked && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn subtle sm" onClick={() => setShowManage(true)}>⚙︎ Gestisci</button>
                <button className="btn primary" onClick={() => fileRef.current?.click()}>＋ Carica quiz</button>
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept=".html,.htm,text/html" multiple hidden
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          <input ref={importRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { if (e.target.files?.[0]) doImport(e.target.files[0]); e.target.value = ""; }} />

          {locked ? (
            <div className="empty">
              <div className="orb">🔒</div>
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
                <div className="orb">🖥️</div>
                <p className="big">La libreria è vuota</p>
                <p>Carica gli HTML dei tuoi quiz, esami o presentazioni (es. <code>esame_fisica.html</code>). Restano su questo dispositivo e si aprono anche offline, in una finestra isolata e sicura.</p>
                <button className="btn primary" onClick={() => fileRef.current?.click()}>＋ Carica il primo quiz</button>
                <p className="hint">…oppure trascina qui i file .html</p>
              </div>
            </div>
          ) : (
            <>
              {stats && stats.count > 0 && (
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
                    <button className="iconbtn" style={{ width: 28, height: 28 }} title="Nuova cartella"
                      onClick={() => newFolder(typeof sel === "string" && sel !== "__all__" && sel !== "__none__" ? sel : "")}>＋</button>
                  </div>
                  <div className="tree">
                    <div className={"tnode" + (sel === "__all__" ? " on" : "") + (dropPath === "__all__" ? " drop" : "")}
                      onClick={() => setSel("__all__")}
                      onDragOver={(e) => { e.preventDefault(); setDropPath("__all__"); }}
                      onDragLeave={() => setDropPath((d) => (d === "__all__" ? null : d))}
                      onDrop={(e) => { const id = e.dataTransfer.getData("text/quizid"); if (id) dropQuizInto(id, "__none__"); }}>
                      <span className="caret" /> <span className="fic">🗂</span>
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
                        <span className="caret" /> <span className="fic">▨</span>
                        <span className="lbl">Senza cartella</span><span className="cnt">{uncategorized}</span>
                      </div>
                    )}
                  </div>
                </aside>

                {/* libreria */}
                <div>
                  <div className="controls">
                    <div className="search">
                      <span className="mag">⌕</span>
                      <input type="search" placeholder="Cerca per nome, nota, cartella o tag…" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <button className={"chip star" + (favOnly ? " on" : "")} onClick={() => setFavOnly((v) => !v)}>★ Preferiti</button>
                    <button className="iconbtn" title="Esporta backup" onClick={doExport}>⤓</button>
                    <button className="iconbtn" title="Importa backup" onClick={() => importRef.current?.click()}>⤒</button>
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
                        <button className="btn primary" onClick={() => fileRef.current?.click()}>＋ Carica quiz</button>
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
                                <button className={"iconbtn" + (x.favorite ? " on" : "")} title="Preferito" onClick={() => toggleFav(x)}>{x.favorite ? "★" : "☆"}</button>
                              </div>
                              {x.note ? <div className="qnote">{x.note}</div> : null}
                              {x.tags?.length ? <div className="qtags">{x.tags.map((t) => <span className="qtag" key={t}>#{t}</span>)}</div> : null}
                              <div className="qmeta">
                                <span>{fmtSize(x.size)}</span><span>·</span>
                                <span>agg. {fmtDate(x.updatedAt)}</span>
                                {x.openCount ? <><span>·</span><span>{x.openCount}× aperto</span></> : null}
                                {x.encrypted ? <><span>·</span><span className="enc">🔒</span></> : null}
                              </div>
                              <div className="qactions">
                                <button className="btn primary sm open" onClick={() => router.push(`/run/${x.id}`)}>▶ Apri</button>
                                <button className="iconbtn" title="Modifica" onClick={() => setEditing(x)}>⋯</button>
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
        <ManageDialog space={activeSpace} onClose={() => setShowManage(false)}
          onExport={doExport} onImport={() => importRef.current?.click()}
          onSyncPush={() => doSync("push")} onSyncPull={() => doSync("pull")}
          onLock={() => { clearVaultKey(activeSpace.id); setSpaces((s) => [...s]); setShowManage(false); flash("Vault bloccato 🔒"); }}
          onDelete={() => onDeleteSpace(activeSpace.id)} />
      )}
      {palette && (
        <Palette quizzes={quizzes || []} spaces={spaces} onClose={() => setPalette(false)}
          onOpenQuiz={(id) => { setPalette(false); router.push(`/run/${id}`); }}
          onSwitchSpace={(id) => { setPalette(false); setActiveId(id); }}
          onCmd={(c) => { setPalette(false); if (c === "upload") fileRef.current?.click(); else if (c === "theme") toggleTheme(); else if (c === "newspace") setShowSpaceDlg(true); else if (c === "export") doExport(); else if (c === "newfolder") newFolder(""); }} />
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
              <span className={"caret" + (open ? " open" : "")} onClick={(e) => { e.stopPropagation(); if (hasKids) onToggle(child.path); }}>{hasKids ? "▸" : ""}</span>
              <span className="fic">{open && hasKids ? "📂" : "📁"}</span>
              <span className="lbl">{child.name}</span>
              <span className="cnt">{counts.get(child.path) || 0}</span>
              <span className="mini" title="Sottocartella" onClick={(e) => { e.stopPropagation(); onNew(child.path); }}>＋</span>
              <span className="mini" title="Rinomina" onClick={(e) => { e.stopPropagation(); onRename(child.path); }}>✎</span>
              <span className="mini" title="Elimina" onClick={(e) => { e.stopPropagation(); onDelete(child.path); }}>🗑</span>
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
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onSave({ name: name.trim() || quiz.name, folder: folder.trim().replace(/^\/+|\/+$/g, ""), note, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) })}>Salva</button>
        </div>
        <div className="row"><button className="btn danger" onClick={onDelete}>Elimina quiz</button></div>
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

function ManageDialog({ space, onClose, onExport, onImport, onSyncPush, onSyncPull, onLock, onDelete }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Gestisci “{space.name}”</h3>
        <p className="lead">Backup, sincronizzazione e sicurezza dello spazio.</p>
        <div className="row"><button className="btn ghost" onClick={onExport}>⤓ Esporta backup</button><button className="btn ghost" onClick={onImport}>⤒ Importa backup</button></div>
        <div className="row"><button className="btn ghost" onClick={onSyncPush}>☁︎ Carica nel cloud</button><button className="btn ghost" onClick={onSyncPull}>⇩ Scarica dal cloud</button></div>
        {space.vault && <div className="row"><button className="btn subtle" onClick={onLock}>🔒 Blocca vault ora</button></div>}
        {space.id !== "local" && <div className="row"><button className="btn danger" onClick={onDelete}>Elimina spazio</button></div>}
        <div className="row"><button className="btn subtle" onClick={onClose}>Chiudi</button></div>
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
      { type: "cmd", id: "theme", ic: "☾", label: "Cambia tema", meta: "azione" },
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
