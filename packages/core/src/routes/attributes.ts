import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

const valueBody = z.object({
  id: z.string().optional(), // present = keep/update existing, absent = new
  value: z.string().min(1).max(80),
  color: z.string().max(9).nullable().optional(), // hex like #RRGGBB
});

const upsertBody = z.object({
  name: z.string().min(1).max(80),
  useImages: z.boolean().optional(),
  useColor: z.boolean().optional(),
  values: z.array(valueBody).default([]),
});

const attributes = new Hono<AppEnv>();

async function loadWithValues(db: ReturnType<typeof createDb>, id: string) {
  const attr = await db
    .select()
    .from(schema.attributes)
    .where(eq(schema.attributes.id, id))
    .get();
  if (!attr) return null;
  const values = await db
    .select()
    .from(schema.attributeValues)
    .where(eq(schema.attributeValues.attributeId, id))
    .orderBy(schema.attributeValues.position)
    .all();
  return { ...attr, values };
}

// GET /api/admin/attributes — all attributes, each with its ordered values.
attributes.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const attrs = await db
    .select()
    .from(schema.attributes)
    .orderBy(schema.attributes.position, schema.attributes.name)
    .all();
  const allValues = await db
    .select()
    .from(schema.attributeValues)
    .orderBy(schema.attributeValues.position)
    .all();
  const byAttr = new Map<string, typeof allValues>();
  for (const v of allValues) {
    const list = byAttr.get(v.attributeId) ?? [];
    list.push(v);
    byAttr.set(v.attributeId, list);
  }
  return c.json({
    attributes: attrs.map((a) => ({ ...a, values: byAttr.get(a.id) ?? [] })),
  });
});

attributes.post("/", async (c) => {
  const db = createDb(c.env.DB);
  const body = parse(upsertBody, await c.req.json().catch(() => ({})));

  const id = newId();
  const maxPos = await db
    .select({ p: schema.attributes.position })
    .from(schema.attributes)
    .orderBy(schema.attributes.position)
    .all();
  const position = maxPos.length;

  await db.insert(schema.attributes).values({
    id,
    name: body.name,
    useImages: body.useImages ?? false,
    useColor: body.useColor ?? false,
    position,
  });
  if (body.values.length) {
    await db.insert(schema.attributeValues).values(
      body.values.map((v, i) => ({
        id: newId(),
        attributeId: id,
        value: v.value,
        color: v.color ?? null,
        position: i,
      })),
    );
  }
  return c.json({ attribute: await loadWithValues(db, id) }, 201);
});

attributes.patch("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = parse(upsertBody.partial(), await c.req.json().catch(() => ({})));

  const existing = await loadWithValues(db, id);
  if (!existing) throw new HTTPException(404, { message: "Attribute not found" });

  const meta: Partial<typeof schema.attributes.$inferInsert> = { updatedAt: Date.now() };
  if (body.name !== undefined) meta.name = body.name;
  if (body.useImages !== undefined) meta.useImages = body.useImages;
  if (body.useColor !== undefined) meta.useColor = body.useColor;
  await db.update(schema.attributes).set(meta).where(eq(schema.attributes.id, id));

  // Reconcile values when the caller sends a values array.
  if (body.values !== undefined) {
    const incoming = body.values;
    const keepIds = new Set(incoming.filter((v) => v.id).map((v) => v.id as string));
    const toDelete = existing.values.filter((v) => !keepIds.has(v.id)).map((v) => v.id);

    if (toDelete.length) {
      const used = await db
        .select({ id: schema.productOptionValues.attributeValueId })
        .from(schema.productOptionValues)
        .where(inArray(schema.productOptionValues.attributeValueId, toDelete))
        .all();
      if (used.length) {
        throw new HTTPException(409, {
          message: "A value in use by a product cannot be removed",
        });
      }
      await db
        .delete(schema.attributeValues)
        .where(inArray(schema.attributeValues.id, toDelete));
    }

    for (const [i, v] of incoming.entries()) {
      if (v.id) {
        await db
          .update(schema.attributeValues)
          .set({ value: v.value, color: v.color ?? null, position: i })
          .where(eq(schema.attributeValues.id, v.id));
      } else {
        await db.insert(schema.attributeValues).values({
          id: newId(),
          attributeId: id,
          value: v.value,
          color: v.color ?? null,
          position: i,
        });
      }
    }
  }

  return c.json({ attribute: await loadWithValues(db, id) });
});

attributes.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const existing = await db
    .select({ id: schema.attributes.id })
    .from(schema.attributes)
    .where(eq(schema.attributes.id, id))
    .get();
  if (!existing) throw new HTTPException(404, { message: "Attribute not found" });

  const used = await db
    .select({ id: schema.productOptions.id })
    .from(schema.productOptions)
    .where(eq(schema.productOptions.attributeId, id))
    .all();
  if (used.length) {
    throw new HTTPException(409, {
      message: "This attribute is used by products and cannot be deleted",
    });
  }

  await db.delete(schema.attributes).where(eq(schema.attributes.id, id));
  return c.json({ ok: true });
});

export { attributes as attributeRoutes };
