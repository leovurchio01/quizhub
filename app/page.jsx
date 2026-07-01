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
} from "@/lib/db";
import { createVault, unlockVault } from "@/lib/crypto";
import { pushSpace, pullSpace, SYNC_STATES } from "@/lib/sync";

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

export default function Desktop() {
  const router = useRouter();
  const [spaces, setSpaces] = useState(null);
  const [activeId, setActiveId] = useState(LOCAL_SPACE_ID);
  const [quizzes, setQuizzes] = useState(null);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("__all__");
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
    fetch("/api/auth/session").then((r) => r.json()).then((s) => setSession(s?.user ? s : null)).catch(() => setSession(null));
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
    tick(); const id = setInterval(tick, 15000); return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async (sid = activeId) => {
    const [list, st] = await Promise.all([listQuizzes(sid), spaceStats(sid)]);
    setQuizzes(list); setStats(st);
  }, [activeId]);

  useEffect(() => {
    if (!spaces) return;
    setQuizzes(null);
    setMeta("activeSpaceId", activeId).catch(() => {});
    if (!locked) refresh(activeId).catch(() => setQuizzes([]));
    else { setQuizzes([]); setStats(null); }
  }, [activeId, spaces, locked, refresh]);

  /* ---- tema ---- */
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("qh-theme", next); } catch {}
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }

  /* ---- upload ---- */
  async function handleFiles(fileList) {
    if (locked) return flash("Sblocca lo spazio per caricare");
    const files = Array.from(fileList || []).filter((f) => /\.html?$/i.test(f.name));
    if (!files.length) return flash("Servono file .html");
    const pre = folder !== "__all__" && folder !== "__none__" ? folder : "";
    for (const f of files) await addQuizFromFile(f, activeId, pre);
    await refresh();
    flash(files.length === 1 ? "Quiz caricato" : files.length + " quiz caricati");
  }

  async function toggleFav(x) { await patchQuiz(x.id, { favorite: !x.favorite }); refresh(); }
  async function saveEdit(patch) { await patchQuiz(editing.id, patch); setEditing(null); refresh(); flash("Salvato"); }
  async function removeQuiz(x) {
    if (!confirm(`Eliminare "${x.name}"? Non si può annullare.`)) return;
    await deleteQuiz(x.id); setEditing(null); refresh(); flash("Quiz eliminato");
  }

  /* ---- spazi / vault ---- */
  async function onCreateSpace({ name, color, passphrase }) {
    const space = await createSpace({ name, color, owner: session?.user?.email || "local", vault: null });
    if (passphrase) {
      const vault = await createVault(passphrase);
      space.vault = vault;
      await putSpace(space);
      const key = await unlockVault(passphrase, vault);
      setVaultKey(space.id, key);
    }
    setSpaces(await listSpaces());
    setActiveId(space.id);
    setShowSpaceDlg(false);
    flash(passphrase ? "Spazio cifrato creato 🔒" : "Spazio creato");
  }

  async function doUnlock(passphrase) {
    try {
      const key = await unlockVault(passphrase, unlockFor.vault);
      setVaultKey(unlockFor.id, key);
      const sid = unlockFor.id;
      setUnlockFor(null);
      setSpaces((s) => [...s]);
      refresh(sid);
      flash("Vault sbloccato 🔓");
    } catch (e) { flash(e.message || "Passphrase errata"); }
  }

  async function onDeleteSpace(id) {
    if (!confirm("Eliminare questo spazio e TUTTI i suoi quiz? Irreversibile.")) return;
    await deleteSpace(id);
    const s = await listSpaces();
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
      const n = await importIntoSpace(activeId, payload);
      refresh(); flash(`${n} quiz importati`);
    } catch { flash("Import non valido"); }
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

  const folders = useMemo(() => {
    if (!quizzes) return [];
    const m = new Map();
    quizzes.forEach((x) => { if (x.folder) m.set(x.folder, (m.get(x.folder) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [quizzes]);

  const filtered = useMemo(() => {
    if (!quizzes) return [];
    const term = q.trim().toLowerCase();
    return quizzes.filter((x) => {
      if (favOnly && !x.favorite) return false;
      if (folder === "__none__" && x.folder) return false;
      if (folder !== "__all__" && folder !== "__none__" && x.folder !== folder) return false;
      if (term) {
        const hay = (x.name + " " + (x.note || "") + " " + (x.folder || "") + " " + (x.tags || []).join(" ")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [quizzes, q, folder, favOnly]);

  if (spaces === null) {
    return <div className="center-load"><div className="spinner" /></div>;
  }

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
        {session === null ? (
          <button className="iconbtn" title="Accedi" onClick={() => (window.location.href = "/login")}>⏻</button>
        ) : session?.user ? (
          <span className="iconbtn" title={session.user.email} style={{ background: spineColor(session.user.email), color: "#fff" }}>
            {initials(session.user.name || session.user.email)}
          </span>
        ) : null}
      </div>

      <div className="layout">
        <div className="dock">
          {spaces.map((s) => (
            <button
              key={s.id}
              className={"spaceicon" + (s.id === activeId ? " on" : "")}
              style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`, color: s.color }}
              title={s.name}
              onClick={() => { setActiveId(s.id); setFolder("__all__"); setQ(""); setFavOnly(false); }}
            >
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
          ) : (
            <>
              {stats && stats.count > 0 && (
                <div className="stats">
                  <div className="stat"><div className="k">Quiz</div><div className="v">{stats.count}</div></div>
                  <div className="stat"><div className="k">Preferiti</div><div className="v">{stats.favorites}</div></div>
                  <div className="stat"><div className="k">Categorie</div><div className="v">{stats.folders}</div></div>
                  <div className="stat"><div className="k">Spazio usato</div><div className="v">{fmtSize(stats.totalBytes).split(" ")[0]}<small> {fmtSize(stats.totalBytes).split(" ")[1]}</small></div></div>
                </div>
              )}

              {quizzes && quizzes.length > 0 && (
                <>
                  <div className="controls">
                    <div className="search">
                      <span className="mag">⌕</span>
                      <input type="search" placeholder="Cerca per nome, nota, categoria o tag…" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    <button className={"chip star" + (favOnly ? " on" : "")} onClick={() => setFavOnly((v) => !v)}>★ Preferiti</button>
                    <button className="iconbtn" title="Esporta backup" onClick={doExport}>⤓</button>
                    <button className="iconbtn" title="Importa backup" onClick={() => importRef.current?.click()}>⤒</button>
                  </div>
                  <div className="chips">
                    <button className={"chip" + (folder === "__all__" ? " on" : "")} onClick={() => setFolder("__all__")}>
                      Tutti <span className="n">{quizzes.length}</span>
                    </button>
                    {folders.map(([name, n]) => (
                      <button key={name} className={"chip" + (folder === name ? " on" : "")} onClick={() => setFolder(name)}>
                        <span className="dot" style={{ background: spineColor(name) }} />{name} <span className="n">{n}</span>
                      </button>
                    ))}
                    {quizzes.some((x) => !x.folder) && (
                      <button className={"chip" + (folder === "__none__" ? " on" : "")} onClick={() => setFolder("__none__")}>Senza categoria</button>
                    )}
                  </div>
                </>
              )}

              {quizzes === null ? (
                <div className="center-load"><div className="spinner" /></div>
              ) : quizzes.length === 0 ? (
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
              ) : filtered.length === 0 ? (
                <div className="empty">
                  <p className="big">Nessun risultato</p>
                  <p>Nessun quiz corrisponde ai filtri attivi.</p>
                  <button className="btn subtle" onClick={() => { setQ(""); setFolder("__all__"); setFavOnly(false); }}>Azzera filtri</button>
                </div>
              ) : (
                <section className={"grid dropzone" + (drag ? " drag" : "")}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}>
                  {filtered.map((x, i) => {
                    const col = spineColor(x.folder || x.name);
                    return (
                      <article className="qcard" key={x.id} style={{ animationDelay: Math.min(i * 30, 300) + "ms", "--spine": col }}>
                        <div className="glowline" />
                        <div className="body">
                          <div className="qtop">
                            <div style={{ minWidth: 0 }}>
                              <div className="qtitle">{x.name}</div>
                              <div className="qcat"><span className="dot" style={{ background: col }} />{x.folder || "senza categoria"}</div>
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
            </>
          )}
        </main>
      </div>

      {editing && (
        <EditSheet quiz={editing} folders={folders.map((f) => f[0])} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => removeQuiz(editing)} />
      )}
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
          onCmd={(c) => { setPalette(false); if (c === "upload") fileRef.current?.click(); else if (c === "theme") toggleTheme(); else if (c === "newspace") setShowSpaceDlg(true); else if (c === "export") doExport(); }} />
      )}
      {toast && <div className="toast">{toast}</div>}
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
        <div className="field"><label>Categoria</label>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="es. Teoria, Laboratorio…" list="fdl" />
          <datalist id="fdl">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <div className="field"><label>Tag (separati da virgola)</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="analisi, capitolo-3, ripasso" /></div>
        <div className="field"><label>Nota</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa copre, quando ripassarlo…" /></div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={() => onSave({ name: name.trim() || quiz.name, folder: folder.trim(), note, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) })}>Salva</button>
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
