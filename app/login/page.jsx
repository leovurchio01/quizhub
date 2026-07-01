"use client";
import { useEffect, useRef, useState } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const btnRef = useRef(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Login non configurato: la home è aperta, torna indietro.
    if (!CLIENT_ID) {
      window.location.href = "/";
      return;
    }

    async function handleCredential(resp) {
      setBusy(true);
      setErr("");
      try {
        const r = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: resp.credential }),
        });
        if (r.ok) window.location.href = "/";
        else setErr("Accesso non riuscito. Riprova.");
      } catch {
        setErr("Errore di rete.");
      } finally {
        setBusy(false);
      }
    }

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredential });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "left",
        });
      }
      // One Tap opzionale
      window.google.accounts.id.prompt();
    };
    document.body.appendChild(s);
    return () => s.remove();
  }, []);

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 18 }}>
          <span className="logo">QH</span>
          <span className="name" style={{ fontSize: "1.4rem" }}>QuizHub<em> OS</em></span>
        </div>
        <p className="big" style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", margin: "0 0 8px" }}>
          Il tuo computer per i quiz
        </p>
        <p style={{ color: "var(--muted)", margin: "0 auto 22px", maxWidth: 320 }}>
          Accedi con Google per attivare gli spazi personali e la sincronizzazione cloud cifrata.
        </p>

        <div ref={btnRef} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
        {busy && <p className="count" style={{ marginTop: 12 }}>Accesso in corso…</p>}
        {err && <p className="count" style={{ marginTop: 12, color: "var(--bad)" }}>{err}</p>}

        <p className="hint" style={{ marginTop: 18 }}>
          Nessun dato lascia il dispositivo senza il tuo consenso. Il login serve solo per il sync opzionale.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          <a onClick={() => (window.location.href = "/")} style={{ cursor: "pointer", color: "var(--brand-ink)" }}>← Continua senza accedere</a>
        </p>
      </div>
    </div>
  );
}
