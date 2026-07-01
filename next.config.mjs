/** @type {import('next').NextConfig} */

// Content-Security-Policy per la shell dell'app (NON per i quiz: quelli
// girano in un iframe sandbox su srcdoc, origine opaca, isolati dalla shell).
// La shell non ha bisogno di eval né di risorse esterne.
// Origini di Google Identity Services (login "Sign in with Google").
const GSI = "https://accounts.google.com/gsi/";

const CSP = [
  "default-src 'self'",
  // Next.js in dev inietta script inline/eval per l'HMR; in prod resta stretto.
  // Lo script GSI è servito da accounts.google.com/gsi/client.
  process.env.NODE_ENV === "development"
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com/gsi/client`
    : `script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client`,
  `style-src 'self' 'unsafe-inline' ${GSI}style`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${GSI}`,
  // I quiz sono resi via srcdoc in iframe sandbox (origine opaca); il bottone
  // GSI è servito in un iframe da accounts.google.com/gsi/.
  `frame-src 'self' blob: ${GSI}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // same-origin-allow-popups: protegge le nostre finestre ma consente il
  // flusso a popup di Google Identity Services.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
