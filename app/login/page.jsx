"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    // Se l'auth è disattivata, la home è aperta: reindirizza.
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((p) => {
        if (!p || Object.keys(p).length === 0) {
          setEnabled(false);
          window.location.href = "/";
        }
      })
      .catch(() => {});
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
        {enabled ? (
          <button className="btn primary" style={{ width: "100%" }} onClick={() => signIn("google", { callbackUrl: "/" })}>
             Accedi con Google
          </button>
        ) : (
          <p className="count">Reindirizzamento…</p>
        )}
        <p className="hint" style={{ marginTop: 18 }}>
          I tuoi quiz restano cifrati sul dispositivo. Il login serve solo per il sync opzionale.
        </p>
      </div>
    </div>
  );
}
