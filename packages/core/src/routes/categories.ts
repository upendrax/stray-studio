import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { slugify, uniqueSlug } from "../lib/slug";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

const MAX_DEPTH = 3; // parent > child > grandchild

const upsertBody = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(80).optional(),
  parentId: z.string().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  coverImageKey: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(400).nullable().optional(),
});

const categories = new Hono<AppEnv>();

// Depth of a category from its ancestry chain (root = 1). Also detects cycles.
async function depthOf(
  db: ReturnType<typeof createDb>,
  parentId: string | null | undefined,
  self?: string,
): Promise<number> {
  let depth = 1;
  let cur = parentId ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (cur === self || seen.has(cur)) {
      throw new HTTPException(400, { message: "Category cannot be its own ancestor" });
    }
    seen.add(cur);
    const row = await db
      .select({ parentId: schema.categories.parentId })
      .from(schema.categories)
      .where(eq(schema.categories.id, cur))
      .get();
    if (!row) throw new HTTPException(400, { message: "Parent category not found" });
    depth++;
    cur = row.parentId;
  }
  return depth;
}

// GET /api/admin/categories — flat list + direct product counts.
categories.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      slug: schema.categories.slug,
      parentId: schema.categories.parentId,
      description: schema.categories.description,
      coverImageKey: schema.categories.coverImageKey,
      sortOrder: schema.categories.sortOrder,
      metaTitle: schema.categories.metaTitle,
      metaDescription: schema.categories.metaDescription,
      productCount: sql<number>`count(${schema.productCategories.productId})`,
    })
    .from(schema.categories)
    .leftJoin(
      schema.productCategories,
      eq(schema.productCategories.categoryId, schema.categories.id),
    )
    .groupBy(schema.categories.id)
    .orderBy(schema.categories.sortOrder, schema.categories.name)
    .all();
  return c.json({ categories: rows });
});

categories.post("/", async (c) => {
  const db = createDb(c.env.DB);
  const body = parse(upsertBody, await c.req.json().catch(() => ({})));

  const depth = await depthOf(db, body.parentId ?? null);
  if (depth > MAX_DEPTH) {
    throw new HTTPException(400, { message: `Categories can be at most ${MAX_DEPTH} levels deep` });
  }

  const taken = new Set(
    (await db.select({ slug: schema.categories.slug }).from(schema.categories).all()).map(
      (r) => r.slug,
    ),
  );
  const slug = uniqueSlug(slugify(body.slug || body.name), taken);

  const id = newId();
  await db.insert(schema.categories).values({
    id,
    name: body.name,
    slug,
    parentId: body.parentId ?? null,
    description: body.description ?? null,
    coverImageKey: body.coverImageKey ?? null,
    sortOrder: body.sortOrder ?? 0,
    metaTitle: body.metaTitle ?? null,
    metaDescription: body.metaDescription ?? null,
  });
  const created = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .get();
  return c.json({ category: created }, 201);
});

categories.patch("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = parse(upsertBody.partial(), await c.req.json().catch(() => ({})));

  const existing = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .get();
  if (!existing) throw new HTTPException(404, { message: "Category not found" });

  if (body.parentId !== undefined) {
    const depth = await depthOf(db, body.parentId ?? null, id);
    if (depth > MAX_DEPTH) {
      throw new HTTPException(400, { message: `Categories can be at most ${MAX_DEPTH} levels deep` });
    }
  }

  const patch: Partial<typeof schema.categories.$inferInsert> = { updatedAt: Date.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.parentId !== undefined) patch.parentId = body.parentId ?? null;
  if (body.description !== undefined) patch.description = body.description ?? null;
  if (body.coverImageKey !== undefined) patch.coverImageKey = body.coverImageKey ?? null;
  if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
  if (body.metaTitle !== undefined) patch.metaTitle = body.metaTitle ?? null;
  if (body.metaDescription !== undefined) patch.metaDescription = body.metaDescription ?? null;

  if (body.slug !== undefined || body.name !== undefined) {
    const taken = new Set(
      (
        await db
          .select({ slug: schema.categories.slug })
          .from(schema.categories)
          .where(ne(schema.categories.id, id))
          .all()
      ).map((r) => r.slug),
    );
    patch.slug = uniqueSlug(slugify(body.slug || body.name || existing.name), taken);
  }

  await db.update(schema.categories).set(patch).where(eq(schema.categories.id, id));
  const updated = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .get();
  return c.json({ category: updated });
});

// DELETE — children move up to the deleted category's parent (Studio behavior);
// product links drop via cascade but products keep their other categories.
categories.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const existing = await db
    .select({ parentId: schema.categories.parentId })
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .get();
  if (!existing) throw new HTTPException(404, { message: "Category not found" });

  await db
    .update(schema.categories)
    .set({ parentId: existing.parentId })
    .where(eq(schema.categories.parentId, id));
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
  return c.json({ ok: true });
});

export { categories as categoryRoutes };
