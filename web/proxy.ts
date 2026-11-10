import { NextResponse, type NextRequest } from "next/server";

/** Pass the requested app path to the server layout so sign-in can send the owner back to it. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-mila-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
