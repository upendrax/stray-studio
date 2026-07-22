import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { slugify, uniqueSlug } from "../lib/slug";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

const imageInput = z.object({ r2Key: z.string().min(1), alt: z.string().nullable().optional() });

const optionInput = z.object({
  attributeId: z.string().min(1),
  // Which attribute values this product offers, in order.
  valueIds: z.array(z.string().min(1)).min(1),
  // Per-value image sets (only for image-carrying attributes like Color),
  // keyed by attributeValueId.
  valueImages: z.record(z.string(), z.array(imageInput)).optional(),
});

const variantInput = z.object({
  // Global attributeValueIds identifying this combination (one per option).
  optionValueIds: z.array(z.string()).default([]),
  sku: z.string().nullable().optional(),
  price: z.number().int().nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  available: z.boolean().optional(),
});

const productBody = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(80).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "draft"]).optional(),
  basePrice: z.number().int().min(0),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  chargeTax: z.boolean().optional(),
  costPerItem: z.number().int().min(0).nullable().optional(),
  trackInventory: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  categoryIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  images: z.array(imageInput).default([]),
  options: z.array(optionInput).default([]),
  variants: z.array(variantInput).default([]),
  // Simple products (no options): the single default variant's stock/sku.
  quantity: z.number().int().min(0).optional(),
  sku: z.string().nullable().optional(),
});

type ProductBody = z.infer<typeof productBody>;
type Db = ReturnType<typeof createDb>;

const products = new Hono<AppEnv>();

// --- Reads --------------------------------------------------------------

async function loadProduct(db: Db, id: string) {
  const p = await db.select().from(schema.products).where(eq(schema.products.id, id)).get();
  if (!p) return null;

  const [images, cats, tags, options, optionValues, variants, vov] = await Promise.all([
    db.select().from(schema.productImages).where(eq(schema.productImages.productId, id)).orderBy(schema.productImages.sortOrder).all(),
    db.select({ categoryId: schema.productCategories.categoryId }).from(schema.productCategories).where(eq(schema.productCategories.productId, id)).all(),
    db.select({ tag: schema.productTags.tag }).from(schema.productTags).where(eq(schema.productTags.productId, id)).all(),
    db.select().from(schema.productOptions).where(eq(schema.productOptions.productId, id)).orderBy(schema.productOptions.position).all(),
    db.select().from(schema.productOptionValues).all(),
    db.select().from(schema.variants).where(eq(schema.variants.productId, id)).orderBy(schema.variants.position).all(),
    db.select().from(schema.variantOptionValues).all(),
  ]);

  const optionIds = new Set(options.map((o) => o.id));
  const povForProduct = optionValues.filter((v) => optionIds.has(v.optionId));
  const povIds = povForProduct.map((v) => v.id);
  // pov.id -> attributeValueId, for translating variant links back to global ids.
  const povToAttrValue = new Map(povForProduct.map((v) => [v.id, v.attributeValueId]));

  const valueImages = povIds.length
    ? await db.select().from(schema.optionValueImages).where(inArray(schema.optionValueImages.optionValueId, povIds)).orderBy(schema.optionValueImages.sortOrder).all()
    : [];
  const imagesByPov = new Map<string, typeof valueImages>();
  for (const im of valueImages) {
    const list = imagesByPov.get(im.optionValueId) ?? [];
    list.push(im);
    imagesByPov.set(im.optionValueId, list);
  }

  const variantIds = new Set(variants.map((v) => v.id));
  const attrValuesByVariant = new Map<string, string[]>();
  for (const link of vov) {
    if (!variantIds.has(link.variantId)) continue;
    const attrValueId = povToAttrValue.get(link.optionValueId);
    if (!attrValueId) continue;
    const list = attrValuesByVariant.get(link.variantId) ?? [];
    list.push(attrValueId);
    attrValuesByVariant.set(link.variantId, list);
  }

  return {
    ...p,
    categoryIds: cats.map((c) => c.categoryId),
    tags: tags.map((t) => t.tag),
    images,
    options: options.map((o) => ({
      id: o.id,
      attributeId: o.attributeId,
      position: o.position,
      values: povForProduct
        .filter((v) => v.optionId === o.id)
        .sort((a, b) => a.position - b.position)
        .map((v) => ({
          id: v.id,
          attributeValueId: v.attributeValueId,
          position: v.position,
          images: imagesByPov.get(v.id) ?? [],
        })),
    })),
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      quantity: v.quantity,
      available: v.available,
      position: v.position,
      archived: v.archived,
      attributeValueIds: attrValuesByVariant.get(v.id) ?? [],
    })),
  };
}

// GET /api/admin/products — summary rows for the list table.
products.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.products).orderBy(sql`${schema.products.createdAt} desc`).all();

  const stock = await db
    .select({
      productId: schema.variants.productId,
      totalStock: sql<number>`coalesce(sum(${schema.variants.quantity}), 0)`,
      variantCount: sql<number>`count(*)`,
    })
    .from(schema.variants)
    .where(eq(schema.variants.archived, false))
    .groupBy(schema.variants.productId)
    .all();
  const stockByProduct = new Map(stock.map((s) => [s.productId, s]));

  const firstImages = await db.select().from(schema.productImages).orderBy(schema.productImages.sortOrder).all();
  const imageByProduct = new Map<string, string>();
  for (const im of firstImages) if (!imageByProduct.has(im.productId)) imageByProduct.set(im.productId, im.r2Key);

  const cats = await db.select().from(schema.productCategories).all();
  const catsByProduct = new Map<string, string[]>();
  for (const pc of cats) {
    const list = catsByProduct.get(pc.productId) ?? [];
    list.push(pc.categoryId);
    catsByProduct.set(pc.productId, list);
  }

  return c.json({
    products: rows.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      hasOptions: p.hasOptions,
      basePrice: p.basePrice,
      compareAtPrice: p.compareAtPrice,
      trackInventory: p.trackInventory,
      lowStockThreshold: p.lowStockThreshold,
      image: imageByProduct.get(p.id) ?? null,
      totalStock: stockByProduct.get(p.id)?.totalStock ?? 0,
      variantCount: stockByProduct.get(p.id)?.variantCount ?? 0,
      categoryIds: catsByProduct.get(p.id) ?? [],
    })),
  });
});

products.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const product = await loadProduct(db, c.req.param("id"));
  if (!product) throw new HTTPException(404, { message: "Product not found" });
  return c.json({ product });
});

// --- Writes -------------------------------------------------------------

// Insert the nested option/value/variant graph for a product. Assumes the
// product row already exists and its child rows have been cleared (update)
// or never existed (create).
async function writeChildren(db: Db, productId: string, body: ProductBody) {
  // Categories + tags
  if (body.categoryIds.length) {
    await db.insert(schema.productCategories).values(
      body.categoryIds.map((categoryId) => ({ productId, categoryId })),
    );
  }
  if (body.tags.length) {
    await db.insert(schema.productTags).values(
      [...new Set(body.tags)].map((tag) => ({ productId, tag })),
    );
  }
  if (body.images.length) {
    await db.insert(schema.productImages).values(
      body.images.map((im, i) => ({ id: newId(), productId, r2Key: im.r2Key, alt: im.alt ?? null, sortOrder: i })),
    );
  }

  // Options + option values; build attributeValueId -> productOptionValue.id map.
  const attrValueToPov = new Map<string, string>();
  for (const [oi, opt] of body.options.entries()) {
    const optionId = newId();
    await db.insert(schema.productOptions).values({
      id: optionId,
      productId,
      attributeId: opt.attributeId,
      position: oi,
    });
    for (const [vi, attrValueId] of opt.valueIds.entries()) {
      const povId = newId();
      attrValueToPov.set(attrValueId, povId);
      await db.insert(schema.productOptionValues).values({
        id: povId,
        optionId,
        attributeValueId: attrValueId,
        position: vi,
      });
      const imgs = opt.valueImages?.[attrValueId] ?? [];
      if (imgs.length) {
        await db.insert(schema.optionValueImages).values(
          imgs.map((im, i) => ({ id: newId(), optionValueId: povId, r2Key: im.r2Key, alt: im.alt ?? null, sortOrder: i })),
        );
      }
    }
  }

  // Variants
  if (body.options.length === 0) {
    // Simple product: single default variant.
    await db.insert(schema.variants).values({
      id: newId(),
      productId,
      sku: body.sku ?? null,
      price: null, // inherits basePrice
      quantity: body.quantity ?? 0,
      available: true,
      position: 0,
    });
  } else {
    for (const [i, v] of body.variants.entries()) {
      const variantId = newId();
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        sku: v.sku ?? null,
        price: v.price ?? null,
        quantity: v.quantity ?? 0,
        available: v.available ?? true,
        position: i,
      });
      const links = v.optionValueIds
        .map((attrValueId) => attrValueToPov.get(attrValueId))
        .filter((x): x is string => Boolean(x))
        .map((optionValueId) => ({ variantId, optionValueId }));
      if (links.length) await db.insert(schema.variantOptionValues).values(links);
    }
  }
}

// Verify referenced attributes/values exist before writing (clear 400 instead
// of an opaque FK failure).
async function validateRefs(db: Db, body: ProductBody) {
  const attrIds = body.options.map((o) => o.attributeId);
  if (attrIds.length) {
    const found = await db.select({ id: schema.attributes.id }).from(schema.attributes).where(inArray(schema.attributes.id, attrIds)).all();
    if (found.length !== new Set(attrIds).size) {
      throw new HTTPException(400, { message: "Unknown attribute referenced" });
    }
  }
  const valueIds = body.options.flatMap((o) => o.valueIds);
  if (valueIds.length) {
    const found = await db.select({ id: schema.attributeValues.id }).from(schema.attributeValues).where(inArray(schema.attributeValues.id, valueIds)).all();
    if (found.length !== new Set(valueIds).size) {
      throw new HTTPException(400, { message: "Unknown attribute value referenced" });
    }
  }
  if (body.categoryIds.length) {
    const found = await db.select({ id: schema.categories.id }).from(schema.categories).where(inArray(schema.categories.id, body.categoryIds)).all();
    if (found.length !== new Set(body.categoryIds).size) {
      throw new HTTPException(400, { message: "Unknown category referenced" });
    }
  }
}

products.post("/", async (c) => {
  const db = createDb(c.env.DB);
  const body = parse(productBody, await c.req.json().catch(() => ({})));
  await validateRefs(db, body);

  const taken = new Set(
    (await db.select({ slug: schema.products.slug }).from(schema.products).all()).map((r) => r.slug),
  );
  const slug = uniqueSlug(slugify(body.slug || body.title), taken);

  const id = newId();
  await db.insert(schema.products).values({
    id,
    title: body.title,
    slug,
    description: body.description ?? null,
    status: body.status ?? "draft",
    hasOptions: body.options.length > 0,
    basePrice: body.basePrice,
    compareAtPrice: body.compareAtPrice ?? null,
    chargeTax: body.chargeTax ?? false,
    costPerItem: body.costPerItem ?? null,
    trackInventory: body.trackInventory ?? true,
    lowStockThreshold: body.lowStockThreshold ?? 5,
  });
  await writeChildren(db, id, body);

  return c.json({ product: await loadProduct(db, id) }, 201);
});

// Delete a product's child rows (explicit order so we don't depend on FK
// cascade being enabled in D1).
async function clearChildren(db: Db, productId: string) {
  const options = await db.select({ id: schema.productOptions.id }).from(schema.productOptions).where(eq(schema.productOptions.productId, productId)).all();
  const optionIds = options.map((o) => o.id);
  const povs = optionIds.length
    ? await db.select({ id: schema.productOptionValues.id }).from(schema.productOptionValues).where(inArray(schema.productOptionValues.optionId, optionIds)).all()
    : [];
  const povIds = povs.map((v) => v.id);
  const variants = await db.select({ id: schema.variants.id }).from(schema.variants).where(eq(schema.variants.productId, productId)).all();
  const variantIds = variants.map((v) => v.id);

  if (variantIds.length) await db.delete(schema.variantOptionValues).where(inArray(schema.variantOptionValues.variantId, variantIds));
  if (povIds.length) await db.delete(schema.optionValueImages).where(inArray(schema.optionValueImages.optionValueId, povIds));
  await db.delete(schema.variants).where(eq(schema.variants.productId, productId));
  if (optionIds.length) await db.delete(schema.productOptionValues).where(inArray(schema.productOptionValues.optionId, optionIds));
  await db.delete(schema.productOptions).where(eq(schema.productOptions.productId, productId));
  await db.delete(schema.productImages).where(eq(schema.productImages.productId, productId));
  await db.delete(schema.productCategories).where(eq(schema.productCategories.productId, productId));
  await db.delete(schema.productTags).where(eq(schema.productTags.productId, productId));
}

products.patch("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = parse(productBody, await c.req.json().catch(() => ({})));

  const existing = await db.select().from(schema.products).where(eq(schema.products.id, id)).get();
  if (!existing) throw new HTTPException(404, { message: "Product not found" });
  await validateRefs(db, body);

  let slug = existing.slug;
  if (body.slug || body.title !== existing.title) {
    const taken = new Set(
      (await db.select({ slug: schema.products.slug }).from(schema.products).all())
        .map((r) => r.slug)
        .filter((s) => s !== existing.slug),
    );
    slug = uniqueSlug(slugify(body.slug || body.title), taken);
  }

  await db
    .update(schema.products)
    .set({
      title: body.title,
      slug,
      description: body.description ?? null,
      status: body.status ?? existing.status,
      hasOptions: body.options.length > 0,
      basePrice: body.basePrice,
      compareAtPrice: body.compareAtPrice ?? null,
      chargeTax: body.chargeTax ?? false,
      costPerItem: body.costPerItem ?? null,
      trackInventory: body.trackInventory ?? true,
      lowStockThreshold: body.lowStockThreshold ?? 5,
      updatedAt: Date.now(),
    })
    .where(eq(schema.products.id, id));

  // Full replace of the nested graph (editor sends the whole product).
  await clearChildren(db, id);
  await writeChildren(db, id, body);

  return c.json({ product: await loadProduct(db, id) });
});

products.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const existing = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, id)).get();
  if (!existing) throw new HTTPException(404, { message: "Product not found" });
  await clearChildren(db, id);
  await db.delete(schema.products).where(eq(schema.products.id, id));
  return c.json({ ok: true });
});

export { products as productRoutes };
