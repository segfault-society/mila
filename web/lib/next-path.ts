/** Only same-site paths are accepted as the place to return to after sign-in. */
export function safeNext(v: string | string[] | undefined | null, fallback = "/app"): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return fallback;
  if (s.startsWith("/sign-in") || s.startsWith("/sign-up") || s.startsWith("/api/")) return fallback;
  return s;
}
