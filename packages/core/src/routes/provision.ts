import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAuth } from "../auth";
import { createDb, schema } from "../db";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

// Production-safe store bootstrap. Guarded by the PROVISION_TOKEN secret, which
// the provisioning script sets just before running this and deletes right
// after. When the secret is unset (normal operation) every route here 404s, so
// there's no standing owner-creation surface. Mirrors the localhost-only dev
// seed-owner, but usable against a deployed Worker exactly once.
const provision = new Hono<AppEnv>();

provision.use("*", async (c, next) => {
  const token = c.env.PROVISION_TOKEN;
  if (!token) throw new HTTPException(404, { message: "Not found" });
  if (c.req.header("authorization") !== `Bearer ${token}`) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  await next();
});

const seedBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).default("Owner"),
});

// Create the store's single owner (public sign-up stays disabled otherwise).
provision.post("/seed-owner", async (c) => {
  const { email, password, name } = parse(seedBody, await c.req.json().catch(() => ({})));
  const db = createDb(c.env.DB);

  const existing = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).get();
  if (existing) throw new HTTPException(409, { message: "A user with that email already exists" });

  const auth = createAuth(c.env, { allowSignUp: true });
  await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(schema.user).set({ role: "owner", emailVerified: true }).where(eq(schema.user.email, email));

  return c.json({ ok: true, email, role: "owner" });
});

export { provision as provisionRoutes };
