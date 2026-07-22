import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

// Store settings live as a single JSON blob under the "store" key. The Studio
// treats settings as one flat object (name, contact, shipping, payments,
// emails), so a merge-on-write key/value row keeps the API dead simple.
const STORE_KEY = "store";

const settings = new Hono<AppEnv>();

async function readStore(db: ReturnType<typeof createDb>): Promise<Record<string, unknown>> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, STORE_KEY)).get();
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

settings.get("/", async (c) => {
  const db = createDb(c.env.DB);
  return c.json({ settings: await readStore(db) });
});

// Merge patch into the stored object (partial update, like the Studio's
// patchSettings). Body is an arbitrary flat object of setting keys.
settings.put("/", async (c) => {
  const db = createDb(c.env.DB);
  const patch = parse(z.record(z.string(), z.unknown()), await c.req.json().catch(() => ({})));
  const merged = { ...(await readStore(db)), ...patch };
  const value = JSON.stringify(merged);

  const existing = await db.select({ key: schema.settings.key }).from(schema.settings).where(eq(schema.settings.key, STORE_KEY)).get();
  if (existing) {
    await db.update(schema.settings).set({ value, updatedAt: Date.now() }).where(eq(schema.settings.key, STORE_KEY));
  } else {
    await db.insert(schema.settings).values({ key: STORE_KEY, value });
  }
  return c.json({ settings: merged });
});

export { settings as settingsRoutes };
