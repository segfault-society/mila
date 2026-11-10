import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { safeNext } from "@/lib/next-path";

const VERIFIER_PARAM = "neon_auth_session_verifier";

// Neon Auth's own middleware. It (1) swaps the one-time verifier Google sends back for the session cookie and
// (2) refreshes session cookies when they are due. Both must happen here: Next.js forbids setting cookies while a
// page renders, so a refresh during render would fail the page.
const neonAuth = auth.middleware({ loginUrl: "/sign-in" });

function isApp(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  if (searchParams.has(VERIFIER_PARAM)) return neonAuth(request);
  if (!isApp(pathname)) return NextResponse.next();

  const res = await neonAuth(request);
  const location = res.headers.get("location");
  if (location && new URL(location, request.url).pathname === "/sign-in") {
    // signed out: send them to sign-in with the page they wanted, so they come back to it
    const next = safeNext(pathname + search, "/app");
    const redirect = NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, request.url));
    for (const cookie of res.headers.getSetCookie()) redirect.headers.append("Set-Cookie", cookie);
    return redirect;
  }
  return res;
}

export const config = {
  // every page (OAuth can return to whichever page started sign-in), but not static files or the auth API
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
