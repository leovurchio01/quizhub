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
    <main className="shell">
      <div className="empty" style={{ paddingTop: 90 }}>
        <div className="filecard" aria-hidden />
        <p className="big">QuizHub</p>
        <p>Accedi con Google per entrare nella tua libreria di quiz.</p>
        {enabled ? (
          <button className="btn primary" onClick={() => signIn("google", { callbackUrl: "/" })}>
            Accedi con Google
          </button>
        ) : (
          <p className="count">Reindirizzamento…</p>
        )}
      </div>
    </main>
  );
}
