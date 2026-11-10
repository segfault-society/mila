import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

/** Neon Auth (managed Better Auth). Users and sessions live in the `neon_auth` schema of the Mila database. */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
