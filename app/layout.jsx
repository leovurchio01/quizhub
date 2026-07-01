import "./globals.css";
import SWRegister from "@/components/SWRegister";

export const metadata = {
  title: "PSS Quiz Hub",
  description: "I tuoi quiz HTML di studio, sempre a portata di iPad.",
  manifest: "/manifest.webmanifest",
  applicationName: "PSS Quiz",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PSS Quiz" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#f5f4ef",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
