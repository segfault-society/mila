const BASE = "https://mila.invalid";

/**
 * Only same-site paths are accepted as the place to return to after sign-in.
 * Parse the value as a URL against a fixed base and require that it stays on that origin: this rejects
 * "//evil.com", "/\evil.com", and tab/newline tricks ("/\t/evil.com") that browsers normalise into another host.
 */
export function safeNext(v: string | string[] | undefined | null, fallback = "/app"): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !s.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
  let url: URL;
  try {
    url = new URL(s, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = url.pathname + url.search + url.hash;
  // check the NORMALISED path too: "/.//evil.com" normalises to "//evil.com", a protocol-relative URL
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  if (path.startsWith("/sign-in") || path.startsWith("/sign-up") || path.startsWith("/api/")) return fallback;
  return path;
}
