// ============================================================
//  QuizHub OS — piani & feature flag (scaffolding)
// ------------------------------------------------------------
//  Base per la futura monetizzazione freemium (vedi ROADMAP.md).
//  Regole:
//   - Tutto ciò che è LOCAL-FIRST resta gratis, per principio.
//   - I gate riguardano solo funzioni cloud/premium.
//   - Il gate lato client è UX; la verità va verificata lato server
//     per ciò che tocca il cloud (sync, marketplace, ecc.).
//  Oggi: non applica alcun blocco (tutto abilitato in locale).
// ============================================================

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    limits: { spaces: Infinity, vaults: 1, cloudSync: false, versionedBackups: false, marketplace: false },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 4,
    limits: { spaces: Infinity, vaults: Infinity, cloudSync: true, versionedBackups: true, marketplace: true },
  },
  team: {
    id: "team",
    name: "Team/Edu",
    price: null, // per postazione
    limits: { spaces: Infinity, vaults: Infinity, cloudSync: true, versionedBackups: true, marketplace: true, sharedSpaces: true, sso: true },
  },
};

// Il piano corrente: oggi sempre "free". In futuro verrà da sessione/DB/Stripe.
export function currentPlan(session) {
  return PLANS[session?.user?.plan] || PLANS.free;
}

// Feature disponibile? Le funzioni puramente locali restano SEMPRE consentite.
const LOCAL_FEATURES = new Set(["spaces", "vaults", "folders", "backup", "runner"]);

export function can(session, feature) {
  if (LOCAL_FEATURES.has(feature)) return true; // local-first: mai bloccato
  const plan = currentPlan(session);
  return !!plan.limits[feature];
}
