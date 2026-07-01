import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Il callback authorized in auth.config gestisce sia il caso "aperto"
// (AUTH_ENABLED != true -> sempre consentito) sia il gate Google.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // Applica a tutto tranne asset statici, endpoint auth e file PWA.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|apple-touch-icon.png|robots.txt).*)",
  ],
};
