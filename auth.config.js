import Google from "next-auth/providers/google";

// Config edge-safe (usata anche dal middleware).
// L'auth Google si attiva solo con AUTH_ENABLED=true.
const authEnabled = process.env.AUTH_ENABLED === "true";

export const authConfig = {
  secret: process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET-in-prod",
  trustHost: true,
  session: { strategy: "jwt" },
  providers: authEnabled ? [Google] : [],
  pages: { signIn: "/login" },
  callbacks: {
    // Con auth disattivata: sempre consentito.
    // Con auth attiva: consentito a chiunque abbia un account Google (sessione valida).
    authorized({ auth }) {
      if (process.env.AUTH_ENABLED !== "true") return true;
      return !!auth;
    },
    // Propaga un id stabile e non indovinabile (sub del provider) nel token…
    jwt({ token, profile }) {
      if (profile?.sub) token.uid = profile.sub;
      return token;
    },
    // …e lo espone in session.user.id: chiave per il sync cloud per-utente.
    session({ session, token }) {
      if (session?.user && token?.uid) session.user.id = token.uid;
      return session;
    },
  },
};
