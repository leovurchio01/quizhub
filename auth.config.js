import Google from "next-auth/providers/google";

// Config edge-safe (usata anche dal middleware).
// L'auth Google si attiva solo con AUTH_ENABLED=true.
const authEnabled = process.env.AUTH_ENABLED === "true";

export const authConfig = {
  secret: process.env.AUTH_SECRET || "insecure-dev-secret-set-AUTH_SECRET-in-prod",
  trustHost: true,
  providers: authEnabled ? [Google] : [],
  pages: { signIn: "/login" },
  callbacks: {
    // Con auth disattivata: sempre consentito.
    // Con auth attiva: consentito a chiunque abbia un account Google (sessione valida).
    authorized({ auth }) {
      if (process.env.AUTH_ENABLED !== "true") return true;
      return !!auth;
    },
  },
};
