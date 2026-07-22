import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

const body = z.object({
  code: z.string().min(1).max(60),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.number().int().min(0).default(0),
  applies: z.enum(["order", "categories", "products"]).default("order"),
  categoryIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
  minType: z.enum(["none", "amount", "quantity"]).default("none"),
  minOrderAmount: z.number().int().min(0).nullable().optional(),
  minQuantity: z.number().int().min(0).nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  oncePerCustomer: z.boolean().optional(),
  startsAt: z.number().int(),
  endsAt: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
});
type Body = z.infer<typeof body>;
type Db = ReturnType<typeof createDb>;

const discounts = new Hono<AppEnv>();

async function scopeIds(db: Db, discountId: string) {
  const [cats, prods] = await Promise.all([
    db.select({ categoryId: schema.discountCategories.categoryId }).from(schema.discountCategories).where(eq(schema.discountCategories.discountId, discountId)).all(),
    db.select({ productId: schema.discountProducts.productId }).from(schema.discountProducts).where(eq(schema.discountProducts.discountId, discountId)).all(),
  ]);
  return { categoryIds: cats.map((c) => c.categoryId), productIds: prods.map((p) => p.productId) };
}

async function writeScope(db: Db, discountId: string, b: Body) {
  await db.delete(schema.discountCategories).where(eq(schema.discountCategories.discountId, discountId));
  await db.delete(schema.discountProducts).where(eq(schema.discountProducts.discountId, discountId));
  if (b.applies === "categories" && b.categoryIds.length) {
    await db.insert(schema.discountCategories).values(b.categoryIds.map((categoryId) => ({ discountId, categoryId })));
  }
  if (b.applies === "products" && b.productIds.length) {
    await db.insert(schema.discountProducts).values(b.productIds.map((productId) => ({ discountId, productId })));
  }
}

// Reject a code that collides with another discount (case-insensitive).
async function assertCodeFree(db: Db, code: string, exceptId?: string) {
  const clash = await db
    .select({ id: schema.discounts.id })
    .from(schema.discounts)
    .where(exceptId ? sql`upper(${schema.discounts.code}) = ${code} and ${schema.discounts.id} <> ${exceptId}` : sql`upper(${schema.discounts.code}) = ${code}`)
    .get();
  if (clash) throw new HTTPException(409, { message: "That code is already in use" });
}

discounts.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.discounts).orderBy(sql`${schema.discounts.createdAt} desc`).all();
  const cats = await db.select().from(schema.discountCategories).all();
  const prods = await db.select().from(schema.discountProducts).all();
  const catsBy = new Map<string, string[]>();
  for (const r of cats) { const l = catsBy.get(r.discountId) ?? []; l.push(r.categoryId); catsBy.set(r.discountId, l); }
  const prodsBy = new Map<string, string[]>();
  for (const r of prods) { const l = prodsBy.get(r.discountId) ?? []; l.push(r.productId); prodsBy.set(r.discountId, l); }
  return c.json({
    discounts: rows.map((d) => ({
      ...d,
      categoryIds: catsBy.get(d.id) ?? [],
      productIds: prodsBy.get(d.id) ?? [],
    })),
  });
});

discounts.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const d = await db.select().from(schema.discounts).where(eq(schema.discounts.id, id)).get();
  if (!d) throw new HTTPException(404, { message: "Discount not found" });
  return c.json({ discount: { ...d, ...(await scopeIds(db, id)) } });
});

discounts.post("/", async (c) => {
  const db = createDb(c.env.DB);
  const b = parse(body, await c.req.json().catch(() => ({})));
  const code = b.code.trim().toUpperCase();
  await assertCodeFree(db, code);

  const id = newId();
  await db.insert(schema.discounts).values({
    id,
    code,
    type: b.type,
    value: b.value,
    applies: b.applies,
    minType: b.minType,
    minOrderAmount: b.minOrderAmount ?? null,
    minQuantity: b.minQuantity ?? null,
    maxUses: b.maxUses ?? null,
    oncePerCustomer: b.oncePerCustomer ?? false,
    startsAt: b.startsAt,
    endsAt: b.endsAt ?? null,
    enabled: b.enabled ?? true,
  });
  await writeScope(db, id, b);
  const d = await db.select().from(schema.discounts).where(eq(schema.discounts.id, id)).get();
  return c.json({ discount: { ...d, ...(await scopeIds(db, id)) } }, 201);
});

discounts.patch("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const b = parse(body, await c.req.json().catch(() => ({})));
  const existing = await db.select({ id: schema.discounts.id }).from(schema.discounts).where(eq(schema.discounts.id, id)).get();
  if (!existing) throw new HTTPException(404, { message: "Discount not found" });

  const code = b.code.trim().toUpperCase();
  await assertCodeFree(db, code, id);

  await db
    .update(schema.discounts)
    .set({
      code,
      type: b.type,
      value: b.value,
      applies: b.applies,
      minType: b.minType,
      minOrderAmount: b.minOrderAmount ?? null,
      minQuantity: b.minQuantity ?? null,
      maxUses: b.maxUses ?? null,
      oncePerCustomer: b.oncePerCustomer ?? false,
      startsAt: b.startsAt,
      endsAt: b.endsAt ?? null,
      enabled: b.enabled ?? true,
      updatedAt: Date.now(),
    })
    .where(eq(schema.discounts.id, id));
  await writeScope(db, id, b);
  const d = await db.select().from(schema.discounts).where(eq(schema.discounts.id, id)).get();
  return c.json({ discount: { ...d, ...(await scopeIds(db, id)) } });
});

// Delete one or many (?ids=a,b or single :id).
discounts.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const existing = await db.select({ id: schema.discounts.id }).from(schema.discounts).where(eq(schema.discounts.id, id)).get();
  if (!existing) throw new HTTPException(404, { message: "Discount not found" });
  await db.delete(schema.discounts).where(eq(schema.discounts.id, id));
  return c.json({ ok: true });
});

discounts.post("/bulk-delete", async (c) => {
  const db = createDb(c.env.DB);
  const { ids } = parse(z.object({ ids: z.array(z.string()).min(1) }), await c.req.json().catch(() => ({})));
  await db.delete(schema.discounts).where(inArray(schema.discounts.id, ids));
  return c.json({ ok: true, deleted: ids.length });
});

export { discounts as discountRoutes };
