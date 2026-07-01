import "./globals.css";
import SWRegister from "@/components/SWRegister";

export const metadata = {
  title: "QuizHub OS — lettore quiz HTML",
  description:
    "Il tuo computer nel browser per leggere quiz, esami e presentazioni HTML. Local-first, sandbox blindata, spazi multi-utente.",
  manifest: "/manifest.webmanifest",
  applicationName: "QuizHub OS",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "QuizHub OS" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
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
