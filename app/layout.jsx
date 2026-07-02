import "./globals.css";
import SWRegister from "@/components/SWRegister";
import StudyProvider from "@/components/StudyProvider";

const SITE_URL = "https://quizhub-psi.vercel.app";
const APP_VERSION = "3.0.1";
const DESCRIPTION =
  "A computer inside your browser for running quizzes, exams and presentations as self-contained HTML. Local-first, zero-knowledge, sandbox-isolated, installable PWA.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "QuizHub OS - run HTML quizzes securely", template: `%s - QuizHub OS ${APP_VERSION}` },
  description: DESCRIPTION,
  applicationName: "QuizHub OS",
  keywords: ["quiz", "exam", "study", "HTML", "PWA", "local-first", "flashcards", "sandbox", "iPad"],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "QuizHub OS" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "QuizHub OS",
    title: "QuizHub OS - run HTML quizzes securely",
    description: DESCRIPTION,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "QuizHub OS" }],
  },
  twitter: {
    card: "summary",
    title: "QuizHub OS - run HTML quizzes securely",
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#0a0f1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Applica tema/font/sfondo salvati prima del paint (niente flash).
const themeInit = `(function(){try{var d=document.documentElement;
var t=localStorage.getItem('qh-theme');if(t&&t!=='midnight')d.setAttribute('data-theme',t);
var f=localStorage.getItem('qh-font');if(f&&f!=='system')d.setAttribute('data-font',f);
var b=localStorage.getItem('qh-bg');if(b&&b!=='grid')d.setAttribute('data-bg',b);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <StudyProvider />
        <SWRegister />
      </body>
    </html>
  );
}
