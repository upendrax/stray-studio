import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAuth } from "../auth";
import { createDb, schema } from "../db";
import type { AppEnv } from "../lib/context";

// Local-only helpers. Guarded so they can never run against a deployed store
// (APP_URL is a real domain in production, localhost in `wrangler dev`).
const dev = new Hono<AppEnv>();

dev.use("*", async (c, next) => {
  if (!c.env.APP_URL.includes("localhost")) {
    throw new HTTPException(404, { message: "Not found" });
  }
  await next();
});

const seedBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).default("Owner"),
});

// Bootstrap the first owner: public sign-up is disabled, so create the account
// through Better Auth with sign-up temporarily allowed, then promote to owner
// and mark verified. Idempotent-ish: returns 409 if the email already exists.
dev.post("/seed-owner", async (c) => {
  const parsed = seedBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: "email, password (min 8) required" });
  }
  const { email, password, name } = parsed.data;

  const db = createDb(c.env.DB);
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (existing) {
    throw new HTTPException(409, { message: "A user with that email exists" });
  }

  const auth = createAuth(c.env, { allowSignUp: true });
  await auth.api.signUpEmail({ body: { email, password, name } });

  await db
    .update(schema.user)
    .set({ role: "owner", emailVerified: true })
    .where(eq(schema.user.email, email));

  return c.json({ ok: true, email, role: "owner" });
});

export { dev as devRoutes };
