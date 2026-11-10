import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

const VERIFIER_PARAM = "neon_auth_session_verifier";

// Neon Auth's own middleware: on the way back from Google it swaps the one-time verifier in the URL for the
// session cookie, then redirects to the same page without it. Our server-side guards run after that.
const neonAuth = auth.middleware({ loginUrl: "/sign-in" });

export async function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.has(VERIFIER_PARAM)) return neonAuth(request);

  if (request.nextUrl.pathname === "/app" || request.nextUrl.pathname.startsWith("/app/")) {
    // pass the requested app path to the server layout so sign-in can send the owner back to it
    const headers = new Headers(request.headers);
    headers.set("x-mila-path", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  // every page (OAuth can return to whichever page started sign-in), but not static files or the auth API
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
