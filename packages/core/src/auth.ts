import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { createDb } from "./db";
import type { Env } from "./env";

// Auth model:
// - Admins (role owner/staff): email + password. No self sign-up — accounts
//   come from store provisioning (owner) or staff invites.
// - Customers: passwordless email OTP (storefront account pages).
export function createAuth(env: Env) {
  const db = createDb(env.DB);

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
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
