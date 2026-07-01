"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listQuizzes,
  putQuiz,
  deleteQuiz,
  addQuizFromFile,
} from "@/lib/db";

/* colore del dorso derivato dalla categoria (stabile) */
const SPINE = ["#3a5bd9", "#1f9d6b", "#c0891f", "#8b5cf6", "#d64545", "#0e7c86", "#d9738a", "#4b5563"];
function spineColor(folder) {
  if (!folder) return "#9aa1b1";
  let hsum = 0;
  for (let i = 0; i < folder.length; i++) hsum = (hsum * 31 + folder.charCodeAt(i)) >>> 0;
  return SPINE[hsum % SPINE.length];
}
function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return "";
  }
}

export default function Home() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(null); // null = caricamento
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("__all__");
  const [favOnly, setFavOnly] = useState(false);
  const [editing, setEditing] = useState(null); // quiz in modifica
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);

  async function refresh() {
    setQuizzes(await listQuizzes());
  }
  useEffect(() => {
    refresh().catch(() => setQuizzes([]));
  }, []);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.html?$/i.test(f.name));
    if (!files.length) {
      flash("Servono file .html");
      return;
    }
    for (const f of files) {
      const preFolder = folder !== "__all__" && folder !== "__none__" ? folder : "";
      await addQuizFromFile(f, preFolder);
    }
    await refresh();
    flash(files.length === 1 ? "Quiz caricato" : files.length + " quiz caricati");
  }

  async function toggleFav(quiz) {
    await putQuiz({ ...quiz, favorite: !quiz.favorite, updatedAt: Date.now() });
    refresh();
  }
  async function saveEdit(patch) {
    await putQuiz({ ...editing, ...patch, updatedAt: Date.now() });
    setEditing(null);
    refresh();
    flash("Salvato");
  }
  async function removeQuiz(quiz) {
    if (!confirm(`Eliminare "${quiz.name}"? Non si può annullare.`)) return;
    await deleteQuiz(quiz.id);
    setEditing(null);
    refresh();
    flash("Quiz eliminato");
  }

  const folders = useMemo(() => {
    if (!quizzes) return [];
    const m = new Map();
    quizzes.forEach((x) => {
      if (x.folder) m.set(x.folder, (m.get(x.folder) || 0) + 1);
    });
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
        const hay = (x.name + " " + (x.note || "") + " " + (x.folder || "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [quizzes, q, folder, favOnly]);

  const loading = quizzes === null;
  const totalCount = quizzes ? quizzes.length : 0;

  return (
    <main className="shell">
      <header className="masthead">
        <div className="wordmark">
          <span className="glyph">
            Quiz<em>Hub</em>
          </span>
          <span className="tag">studio · offline</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            ＋ Carica quiz
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm,text/html"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>

      {/* controlli */}
      {totalCount > 0 && (
        <>
          <div className="controls">
            <div className="search">
              <span className="mag" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                placeholder="Cerca per nome, nota o categoria…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Cerca quiz"
              />
            </div>
            <button
              className={"chip star" + (favOnly ? " on" : "")}
              onClick={() => setFavOnly((v) => !v)}
              aria-pressed={favOnly}
            >
              ★ Preferiti
            </button>
          </div>

          <div className="chips" style={{ marginBottom: 20 }}>
            <button className={"chip" + (folder === "__all__" ? " on" : "")} onClick={() => setFolder("__all__")}>
              Tutti <span className="n">{totalCount}</span>
            </button>
            {folders.map(([name, n]) => (
              <button
                key={name}
                className={"chip" + (folder === name ? " on" : "")}
                onClick={() => setFolder(name)}
              >
                <span className="dot" style={{ background: spineColor(name) }} />
                {name} <span className="n">{n}</span>
              </button>
            ))}
            {quizzes.some((x) => !x.folder) && (
              <button
                className={"chip" + (folder === "__none__" ? " on" : "")}
                onClick={() => setFolder("__none__")}
              >
                Senza categoria
              </button>
            )}
          </div>
        </>
      )}

      {/* corpo */}
      {loading ? (
        <p className="count">Carico la libreria…</p>
      ) : totalCount === 0 ? (
        <div
          className={"dropzone" + (drag ? " drag" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="empty">
            <div className="filecard" aria-hidden />
            <p className="big">La tua libreria è vuota</p>
            <p>
              Carica gli HTML dei quiz che hai preparato (come <code>pss_exam_trainer.html</code>).
              Restano salvati su questo dispositivo e si aprono anche offline.
            </p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              ＋ Carica il primo quiz
            </button>
            <p className="hint">…oppure trascina qui i file .html</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <p className="big">Nessun risultato</p>
          <p>Nessun quiz corrisponde ai filtri attivi. Prova a svuotare la ricerca o a scegliere “Tutti”.</p>
          <button
            className="btn subtle"
            onClick={() => {
              setQ("");
              setFolder("__all__");
              setFavOnly(false);
            }}
          >
            Azzera filtri
          </button>
        </div>
      ) : (
        <section
          className={"grid dropzone" + (drag ? " drag" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          {filtered.map((x, i) => (
            <article
              className={"qcard" + (x.favorite ? " fav" : "")}
              key={x.id}
              style={{ animationDelay: Math.min(i * 30, 300) + "ms" }}
            >
              <div className="spine" style={{ background: spineColor(x.folder) }} />
              <div className="corner" aria-hidden />
              <div className="body">
                <div className="qtop">
                  <div style={{ minWidth: 0 }}>
                    <div className="qtitle">{x.name}</div>
                    <div className="qcat">
                      <span className="dot" style={{ background: spineColor(x.folder) }} />
                      {x.folder || "senza categoria"}
                    </div>
                  </div>
                  <button
                    className={"iconbtn star" + (x.favorite ? " on" : "")}
                    title={x.favorite ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
                    aria-label="Preferito"
                    onClick={() => toggleFav(x)}
                  >
                    {x.favorite ? "★" : "☆"}
                  </button>
                </div>

                {x.note ? <div className="qnote">{x.note}</div> : null}

                <div className="qmeta">
                  <span>{fmtSize(x.size)}</span>
                  <span>·</span>
                  <span>agg. {fmtDate(x.updatedAt)}</span>
                </div>

                <div className="qactions">
                  <button className="btn primary sm open" onClick={() => router.push(`/run/${x.id}`)}>
                    ▶ Apri
                  </button>
                  <button className="iconbtn" title="Modifica" aria-label="Modifica" onClick={() => setEditing(x)}>
                    ⋯
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* foglio di modifica */}
      {editing && (
        <EditSheet
          quiz={editing}
          folders={folders.map((f) => f[0])}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          onDelete={() => removeQuiz(editing)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function EditSheet({ quiz, folders, onClose, onSave, onDelete }) {
  const [name, setName] = useState(quiz.name);
  const [folder, setFolder] = useState(quiz.folder || "");
  const [note, setNote] = useState(quiz.note || "");

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Modifica quiz</h3>
        <div className="field">
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome del quiz" />
        </div>
        <div className="field">
          <label>Categoria</label>
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="es. Teoria, Laboratorio, Ripasso…"
            list="folders-dl"
          />
          <datalist id="folders-dl">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Nota</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Appunti su questo quiz: cosa copre, quando ripassarlo…"
          />
        </div>
        <div className="row">
          <button className="btn subtle" onClick={onClose}>
            Annulla
          </button>
          <button className="btn primary" onClick={() => onSave({ name: name.trim() || quiz.name, folder: folder.trim(), note })}>
            Salva
          </button>
        </div>
        <div className="row">
          <button className="btn danger" onClick={onDelete}>
            Elimina quiz
          </button>
        </div>
      </div>
    </div>
  );
}
