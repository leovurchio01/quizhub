import "./globals.css";
import SWRegister from "@/components/SWRegister";

const SITE_URL = "https://quizhub-psi.vercel.app";
const DESCRIPTION =
  "A computer inside your browser for running quizzes, exams and presentations as self-contained HTML. Local-first, zero-knowledge, sandbox-isolated, installable PWA.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "QuizHub OS — run HTML quizzes securely", template: "%s · QuizHub OS" },
  description: DESCRIPTION,
  applicationName: "QuizHub OS",
  keywords: ["quiz", "exam", "study", "HTML", "PWA", "local-first", "flashcards", "sandbox", "iPad"],
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "QuizHub OS" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "QuizHub OS",
    title: "QuizHub OS — run HTML quizzes securely",
    description: DESCRIPTION,
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "QuizHub OS" }],
  },
  twitter: {
    card: "summary",
    title: "QuizHub OS — run HTML quizzes securely",
    description: DESCRIPTION,
    images: ["/icon-512.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Applica il tema salvato prima del paint (niente flash).
const themeInit = `(function(){try{var t=localStorage.getItem('qh-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
