import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { createDb } from "./db";
import type { Env } from "./env";

// Trusted origins for CORS + Better Auth cookie handling: the API itself,
// the Studio SPA (Vite dev), and the Astro storefront (dev). Per-client
// production origins get appended from APP_URL.
export function trustedOrigins(env: Env) {
  const origins = [env.APP_URL, "http://localhost:5173", "http://localhost:4321"];
  if (env.STOREFRONT_URL) origins.push(env.STOREFRONT_URL);
  return origins;
}

// Auth model:
// - Admins (role owner/staff): email + password. No self sign-up — accounts
//   come from store provisioning (owner) or staff invites.
// - Customers: passwordless email OTP (storefront account pages).
//
// `allowSignUp` is a server-side escape hatch used ONLY by the localhost dev
// owner-seed route; the public sign-up endpoint stays disabled everywhere else.
export function createAuth(env: Env, opts?: { allowSignUp?: boolean }) {
  const db = createDb(env.DB);

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !opts?.allowSignUp,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "customer",
          input: false,
        },
        phone: {
          type: "string",
          required: false,
        },
      },
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          // TODO: send via Resend once email templates land.
          // Local dev: OTP is visible in `wrangler dev` logs.
          console.log(`[auth] OTP for ${email}: ${otp}`);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
