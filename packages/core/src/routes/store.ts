import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Db } from "../db";
import { parse } from "../lib/validate";
import { newId } from "../lib/id";
import { md5 } from "../lib/md5";
import { sessionMiddleware } from "../middleware/auth";
import type { AppEnv } from "../lib/context";

// Public storefront API. Everything here is unauthenticated and read-only —
// only *active* products are ever exposed. Money stays integer cents (the
// storefront formats to LKR at the edge, like the Studio).
const store = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type ProductRow = typeof schema.products.$inferSelect;
type VariantRow = typeof schema.variants.$inferSelect;

const effectivePrice = (v: Pick<VariantRow, "price">, basePrice: number) =>
  v.price ?? basePrice;

// Price range + stock over a product's live (non-archived) variants.
function priceAndStock(product: ProductRow, variants: VariantRow[]) {
  const live = variants.filter((v) => !v.archived);
  const prices = live.map((v) => effectivePrice(v, product.basePrice));
  const priceMin = prices.length ? Math.min(...prices) : product.basePrice;
  const priceMax = prices.length ? Math.max(...prices) : product.basePrice;
  const qty = live
    .filter((v) => v.available)
    .reduce((sum, v) => sum + v.quantity, 0);
  const inStock = product.trackInventory ? qty > 0 : true;
  return { priceMin, priceMax, inStock };
}

// Compact card rows for grids (home, catalog, collection). Batches every
// lookup so a grid of N products is a constant number of queries.
async function buildCards(db: Db, products: ProductRow[]) {
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);

  const [variants, images, options, attrs] = await Promise.all([
    db.select().from(schema.variants).where(inArray(schema.variants.productId, ids)).all(),
    db
      .select()
      .from(schema.productImages)
      .where(inArray(schema.productImages.productId, ids))
      .orderBy(schema.productImages.sortOrder)
      .all(),
    db
      .select()
      .from(schema.productOptions)
      .where(inArray(schema.productOptions.productId, ids))
      .orderBy(schema.productOptions.position)
      .all(),
    db.select().from(schema.attributes).all(),
  ]);

  const variantsByProduct = groupBy(variants, (v) => v.productId);
  const firstImageByProduct = new Map<string, string>();
  for (const im of images) {
    if (!firstImageByProduct.has(im.productId)) firstImageByProduct.set(im.productId, im.r2Key);
  }

  // Swatches: values of each product's image/colour-carrying option, so a card
  // can show colour dots. Prefer the image-carrying option (usually Colour).
  const attrById = new Map(attrs.map((a) => [a.id, a]));
  const swatchOptionByProduct = new Map<string, string>(); // productId -> optionId
  for (const o of options) {
    const attr = attrById.get(o.attributeId);
    if (!attr) continue;
    const existing = swatchOptionByProduct.get(o.productId);
    if (!existing) {
      if (attr.useImages || attr.useColor) swatchOptionByProduct.set(o.productId, o.id);
    } else {
      // Upgrade to an image-carrying option if we only had a colour one.
      const cur = options.find((x) => x.id === existing);
      const curAttr = cur && attrById.get(cur.attributeId);
      if (attr.useImages && curAttr && !curAttr.useImages) swatchOptionByProduct.set(o.productId, o.id);
    }
  }

  const swatchOptionIds = [...swatchOptionByProduct.values()];
  const povs = swatchOptionIds.length
    ? await db
        .select()
        .from(schema.productOptionValues)
        .where(inArray(schema.productOptionValues.optionId, swatchOptionIds))
        .orderBy(schema.productOptionValues.position)
        .all()
    : [];
  const attrValues = await loadAttributeValues(db, povs.map((v) => v.attributeValueId));
  const povFirstImage = await loadFirstOptionValueImages(db, povs.map((v) => v.id));
  const povsByOption = groupBy(povs, (v) => v.optionId);

  return products.map((p) => {
    const { priceMin, priceMax, inStock } = priceAndStock(p, variantsByProduct.get(p.id) ?? []);
    let firstImage = firstImageByProduct.get(p.id) ?? null;

    const swatchOptId = swatchOptionByProduct.get(p.id);
    const swatches = (swatchOptId ? povsByOption.get(swatchOptId) ?? [] : []).map((pov) => {
      const av = attrValues.get(pov.attributeValueId);
      return {
        value: av?.value ?? "",
        color: av?.color ?? null,
        image: povFirstImage.get(pov.id) ?? null,
      };
    });
    // Fall back to a colour image if the product has no default gallery.
    if (!firstImage) firstImage = swatches.find((s) => s.image)?.image ?? null;

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      priceMin,
      priceMax,
      compareAtPrice: p.compareAtPrice,
      image: firstImage,
      inStock,
      hasOptions: p.hasOptions,
      swatches,
    };
  });
}

// attributeValueId -> { value, color }
async function loadAttributeValues(db: Db, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = unique.length
    ? await db.select().from(schema.attributeValues).where(inArray(schema.attributeValues.id, unique)).all()
    : [];
  return new Map(rows.map((r) => [r.id, r]));
}

// productOptionValue.id -> first image r2Key (thumbnail for a colour).
async function loadFirstOptionValueImages(db: Db, povIds: string[]) {
  const unique = [...new Set(povIds)];
  const rows = unique.length
    ? await db
        .select()
        .from(schema.optionValueImages)
        .where(inArray(schema.optionValueImages.optionValueId, unique))
        .orderBy(schema.optionValueImages.sortOrder)
        .all()
    : [];
  const first = new Map<string, string>();
  for (const im of rows) if (!first.has(im.optionValueId)) first.set(im.optionValueId, im.r2Key);
  return first;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

// GET /api/store/products?category=<slug>&sort=<newest|price-asc|price-desc>&limit=&offset=
store.get("/products", async (c) => {
  const db = createDb(c.env.DB);
  const categorySlug = c.req.query("category");
  const sort = c.req.query("sort") ?? "newest";
  const limit = Math.min(Number(c.req.query("limit")) || 48, 100);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

  // Restrict to a category (and its descendants) when asked.
  let productIdFilter: Set<string> | null = null;
  if (categorySlug) {
    const cat = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.slug, categorySlug))
      .get();
    if (!cat) return c.json({ products: [], total: 0 });
    const catIds = await descendantCategoryIds(db, cat.id);
    const links = await db
      .select({ productId: schema.productCategories.productId })
      .from(schema.productCategories)
      .where(inArray(schema.productCategories.categoryId, catIds))
      .all();
    productIdFilter = new Set(links.map((l) => l.productId));
    if (productIdFilter.size === 0) return c.json({ products: [], total: 0 });
  }

  const where = productIdFilter
    ? and(eq(schema.products.status, "active"), inArray(schema.products.id, [...productIdFilter]))
    : eq(schema.products.status, "active");

  const rows = await db.select().from(schema.products).where(where).all();

  const cards = await buildCards(db, rows);
  cards.sort(cardSorter(sort, rows));
  const page = cards.slice(offset, offset + limit);

  return c.json({ products: page, total: cards.length });
});

function cardSorter(sort: string, rows: ProductRow[]) {
  const createdAt = new Map(rows.map((r) => [r.id, r.createdAt]));
  type Card = Awaited<ReturnType<typeof buildCards>>[number];
  if (sort === "price-asc") return (a: Card, b: Card) => a.priceMin - b.priceMin;
  if (sort === "price-desc") return (a: Card, b: Card) => b.priceMin - a.priceMin;
  // newest (default)
  return (a: Card, b: Card) => (createdAt.get(b.id) ?? 0) - (createdAt.get(a.id) ?? 0);
}

// GET /api/store/products/:slug — full detail for the PDP.
store.get("/products/:slug", async (c) => {
  const db = createDb(c.env.DB);
  const slug = c.req.param("slug");

  const p = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), eq(schema.products.status, "active")))
    .get();
  if (!p) throw new HTTPException(404, { message: "Product not found" });

  const [images, catLinks, options, allPov, variants, vov] = await Promise.all([
    db.select().from(schema.productImages).where(eq(schema.productImages.productId, p.id)).orderBy(schema.productImages.sortOrder).all(),
    db.select({ categoryId: schema.productCategories.categoryId }).from(schema.productCategories).where(eq(schema.productCategories.productId, p.id)).all(),
    db.select().from(schema.productOptions).where(eq(schema.productOptions.productId, p.id)).orderBy(schema.productOptions.position).all(),
    db.select().from(schema.productOptionValues).all(),
    db.select().from(schema.variants).where(and(eq(schema.variants.productId, p.id), eq(schema.variants.archived, false))).orderBy(schema.variants.position).all(),
    db.select().from(schema.variantOptionValues).all(),
  ]);

  const optionIds = new Set(options.map((o) => o.id));
  const povForProduct = allPov.filter((v) => optionIds.has(v.optionId));
  const povIds = povForProduct.map((v) => v.id);
  const povToAttrValue = new Map(povForProduct.map((v) => [v.id, v.attributeValueId]));

  const [attrs, attrValues, valueImages] = await Promise.all([
    db.select().from(schema.attributes).where(inArray(schema.attributes.id, options.map((o) => o.attributeId).length ? options.map((o) => o.attributeId) : ["_"])).all(),
    loadAttributeValues(db, povForProduct.map((v) => v.attributeValueId)),
    povIds.length
      ? db.select().from(schema.optionValueImages).where(inArray(schema.optionValueImages.optionValueId, povIds)).orderBy(schema.optionValueImages.sortOrder).all()
      : Promise.resolve([]),
  ]);
  const attrById = new Map(attrs.map((a) => [a.id, a]));
  const imagesByPov = groupBy(valueImages, (im) => im.optionValueId);

  // Categories for breadcrumb / links.
  const catIds = catLinks.map((c) => c.categoryId);
  const cats = catIds.length
    ? await db.select({ id: schema.categories.id, name: schema.categories.name, slug: schema.categories.slug }).from(schema.categories).where(inArray(schema.categories.id, catIds)).all()
    : [];

  // Map variant -> the global attributeValueIds identifying its combination.
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

  const { priceMin, priceMax, inStock } = priceAndStock(p, variants);

  const product = {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    basePrice: p.basePrice,
    compareAtPrice: p.compareAtPrice,
    priceMin,
    priceMax,
    inStock,
    hasOptions: p.hasOptions,
    trackInventory: p.trackInventory,
    images: images.map((im) => ({ r2Key: im.r2Key, alt: im.alt })),
    categories: cats,
    options: options.map((o) => {
      const attr = attrById.get(o.attributeId);
      return {
        attributeId: o.attributeId,
        name: attr?.name ?? "",
        useImages: attr?.useImages ?? false,
        useColor: attr?.useColor ?? false,
        values: povForProduct
          .filter((v) => v.optionId === o.id)
          .sort((a, b) => a.position - b.position)
          .map((v) => {
            const av = attrValues.get(v.attributeValueId);
            return {
              id: v.attributeValueId, // storefront selects by global attributeValueId
              value: av?.value ?? "",
              color: av?.color ?? null,
              images: (imagesByPov.get(v.id) ?? []).map((im) => im.r2Key),
            };
          }),
      };
    }),
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      price: effectivePrice(v, p.basePrice),
      quantity: v.quantity,
      available: v.available,
      inStock: p.trackInventory ? v.available && v.quantity > 0 : v.available,
      optionValueIds: attrValuesByVariant.get(v.id) ?? [],
    })),
  };

  return c.json({ product });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// All descendant category ids of `rootId` (inclusive), max 3 levels deep.
async function descendantCategoryIds(db: Db, rootId: string): Promise<string[]> {
  const all = await db.select({ id: schema.categories.id, parentId: schema.categories.parentId }).from(schema.categories).all();
  const childrenOf = groupBy(all, (c) => c.parentId ?? "");
  const out = [rootId];
  let frontier = [rootId];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) for (const child of childrenOf.get(id) ?? []) next.push(child.id);
    out.push(...next);
    frontier = next;
  }
  return [...new Set(out)];
}

// GET /api/store/categories — flat list with parentId + active-product counts
// (the storefront builds its nav tree). Empty categories are still returned so
// the owner sees them; the theme can hide zero-count ones.
store.get("/categories", async (c) => {
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
    })
    .from(schema.categories)
    .orderBy(schema.categories.sortOrder, schema.categories.name)
    .all();

  // Direct active-product counts per category.
  const counts = await db
    .select({
      categoryId: schema.productCategories.categoryId,
      count: sql<number>`count(*)`,
    })
    .from(schema.productCategories)
    .innerJoin(schema.products, eq(schema.products.id, schema.productCategories.productId))
    .where(eq(schema.products.status, "active"))
    .groupBy(schema.productCategories.categoryId)
    .all();
  const countBy = new Map(counts.map((c) => [c.categoryId, c.count]));

  return c.json({
    categories: rows.map((r) => ({ ...r, productCount: countBy.get(r.id) ?? 0 })),
  });
});

// GET /api/store/categories/:slug — category meta + its product cards.
store.get("/categories/:slug", async (c) => {
  const db = createDb(c.env.DB);
  const slug = c.req.param("slug");
  const sort = c.req.query("sort") ?? "newest";

  const cat = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get();
  if (!cat) throw new HTTPException(404, { message: "Category not found" });

  const catIds = await descendantCategoryIds(db, cat.id);
  const links = await db
    .select({ productId: schema.productCategories.productId })
    .from(schema.productCategories)
    .where(inArray(schema.productCategories.categoryId, catIds))
    .all();
  const ids = [...new Set(links.map((l) => l.productId))];

  const rows = ids.length
    ? await db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.status, "active"), inArray(schema.products.id, ids)))
        .all()
    : [];
  const cards = await buildCards(db, rows);
  cards.sort(cardSorter(sort, rows));

  return c.json({
    category: {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      coverImageKey: cat.coverImageKey,
      metaTitle: cat.metaTitle,
      metaDescription: cat.metaDescription,
    },
    products: cards,
  });
});

// ---------------------------------------------------------------------------
// Cart validation — the authoritative pricing pass. The storefront bag is
// localStorage (prices can be stale or tampered), so every price, stock cap,
// discount and shipping figure is recomputed here from the DB. Checkout will
// reuse `priceCart` so the order is created from the same numbers.
// ---------------------------------------------------------------------------

type CartInput = { variantId: string; quantity: number };

export type CartLine = {
  variantId: string;
  productId?: string;
  slug?: string;
  title?: string;
  variantLabel?: string | null;
  image?: string | null;
  unitPrice?: number;
  quantity: number; // effective (after any stock cap)
  requestedQuantity: number;
  lineTotal?: number;
  maxQuantity?: number | null; // stock ceiling when tracked
  adjusted?: boolean; // quantity was capped to stock
  removed?: boolean; // no longer purchasable
  reason?: string;
};

type DiscountResult =
  | { valid: false; code: string; reason: string; amount: 0 }
  | { valid: true; code: string; type: "percent" | "fixed" | "free_shipping"; value: number; amount: number; freeShipping: boolean };

const rs = (cents: number) => `Rs. ${(cents / 100).toLocaleString("en-US")}`;

async function readStoreBlob(db: Db): Promise<Record<string, unknown>> {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, "store")).get();
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type DiscountCtx = {
  subtotal: number;
  totalQty: number;
  lineTotalByProduct: Map<string, number>;
  productCategoryIds: Map<string, string[]>;
};

async function evaluateDiscount(db: Db, rawCode: string, ctx: DiscountCtx): Promise<DiscountResult> {
  const code = rawCode.toUpperCase();
  const invalid = (reason: string): DiscountResult => ({ valid: false, code, reason, amount: 0 });

  const d = await db.select().from(schema.discounts).where(eq(schema.discounts.code, code)).get();
  if (!d) return invalid("That code isn't valid");
  if (!d.enabled) return invalid("That code is no longer active");

  const now = Date.now();
  if (d.startsAt > now) return invalid("That code isn't active yet");
  if (d.endsAt != null && d.endsAt < now) return invalid("That code has expired");
  if (d.maxUses != null && d.usedCount >= d.maxUses) return invalid("That code has reached its limit");
  if (d.minType === "amount" && d.minOrderAmount != null && ctx.subtotal < d.minOrderAmount)
    return invalid(`Spend ${rs(d.minOrderAmount)} to use this code`);
  if (d.minType === "quantity" && d.minQuantity != null && ctx.totalQty < d.minQuantity)
    return invalid(`Add ${d.minQuantity} items to use this code`);

  // Eligible subtotal depends on scope.
  let eligible = ctx.subtotal;
  if (d.applies === "categories") {
    const rows = await db.select().from(schema.discountCategories).where(eq(schema.discountCategories.discountId, d.id)).all();
    const catIds = new Set(rows.map((r) => r.categoryId));
    eligible = 0;
    for (const [productId, total] of ctx.lineTotalByProduct) {
      const productCats = ctx.productCategoryIds.get(productId) ?? [];
      if (productCats.some((c) => catIds.has(c))) eligible += total;
    }
  } else if (d.applies === "products") {
    const rows = await db.select().from(schema.discountProducts).where(eq(schema.discountProducts.discountId, d.id)).all();
    const productSet = new Set(rows.map((r) => r.productId));
    eligible = 0;
    for (const [productId, total] of ctx.lineTotalByProduct) {
      if (productSet.has(productId)) eligible += total;
    }
  }

  if (d.type !== "free_shipping" && eligible <= 0) return invalid("That code doesn't apply to your items");

  let amount = 0;
  if (d.type === "percent") amount = Math.round((eligible * d.value) / 100);
  else if (d.type === "fixed") amount = Math.min(d.value, eligible);

  return { valid: true, code, type: d.type, value: d.value, amount, freeShipping: d.type === "free_shipping" };
}

// The shared cart-pricing engine. Returns fully-resolved lines + money totals.
export async function priceCart(
  db: Db,
  rawItems: CartInput[],
  discountCode: string | undefined,
  blob: Record<string, unknown>,
) {
  // Merge duplicate variant lines.
  const wanted = new Map<string, number>();
  for (const it of rawItems) wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.quantity);
  const variantIds = [...wanted.keys()];

  const shipRate = Math.round(Number(blob.shipRate || 0) * 100) || 0;
  const shipFreeRs = Number(blob.shipFree || 0);
  const freeAbove = shipFreeRs > 0 ? Math.round(shipFreeRs * 100) : null;

  const empty = {
    items: [] as CartLine[],
    subtotal: 0,
    discount: null as DiscountResult | null,
    discountAmount: 0,
    shipping: 0,
    shipRate,
    freeShippingThreshold: freeAbove,
    total: 0,
    itemCount: 0,
    currency: "LKR",
  };
  if (variantIds.length === 0) return empty;

  const [variants, vov] = await Promise.all([
    db.select().from(schema.variants).where(inArray(schema.variants.id, variantIds)).all(),
    db.select().from(schema.variantOptionValues).where(inArray(schema.variantOptionValues.variantId, variantIds)).all(),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const products = productIds.length
    ? await db.select().from(schema.products).where(inArray(schema.products.id, productIds)).all()
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  // Variant labels ("Black / M"), ordered by option then value position.
  const povIds = [...new Set(vov.map((l) => l.optionValueId))];
  const povs = povIds.length
    ? await db.select().from(schema.productOptionValues).where(inArray(schema.productOptionValues.id, povIds)).all()
    : [];
  const povById = new Map(povs.map((p) => [p.id, p]));
  const optionIds = [...new Set(povs.map((p) => p.optionId))];
  const options = optionIds.length
    ? await db.select().from(schema.productOptions).where(inArray(schema.productOptions.id, optionIds)).all()
    : [];
  const optionById = new Map(options.map((o) => [o.id, o]));
  const attrValues = await loadAttributeValues(db, povs.map((p) => p.attributeValueId));
  const linksByVariant = groupBy(vov, (l) => l.variantId);
  const povImageFirst = await loadFirstOptionValueImages(db, povIds);

  const productImages = productIds.length
    ? await db.select().from(schema.productImages).where(inArray(schema.productImages.productId, productIds)).orderBy(schema.productImages.sortOrder).all()
    : [];
  const firstProductImage = new Map<string, string>();
  for (const im of productImages) if (!firstProductImage.has(im.productId)) firstProductImage.set(im.productId, im.r2Key);

  const productCats = productIds.length
    ? await db.select().from(schema.productCategories).where(inArray(schema.productCategories.productId, productIds)).all()
    : [];
  const productCategoryIds = new Map<string, string[]>();
  for (const pc of productCats) {
    const list = productCategoryIds.get(pc.productId) ?? [];
    list.push(pc.categoryId);
    productCategoryIds.set(pc.productId, list);
  }

  const labelFor = (variantId: string): string | null => {
    const parts = (linksByVariant.get(variantId) ?? [])
      .map((l) => {
        const pov = povById.get(l.optionValueId);
        if (!pov) return null;
        const opt = optionById.get(pov.optionId);
        const av = attrValues.get(pov.attributeValueId);
        return { optPos: opt?.position ?? 0, valPos: pov.position, value: av?.value ?? "" };
      })
      .filter((x): x is { optPos: number; valPos: number; value: string } => Boolean(x));
    if (!parts.length) return null;
    parts.sort((a, b) => a.optPos - b.optPos || a.valPos - b.valPos);
    return parts.map((p) => p.value).join(" / ");
  };
  const imageFor = (variantId: string, productId: string): string | null => {
    for (const l of linksByVariant.get(variantId) ?? []) {
      const img = povImageFirst.get(l.optionValueId);
      if (img) return img;
    }
    return firstProductImage.get(productId) ?? null;
  };

  const items: CartLine[] = [];
  let subtotal = 0;
  let totalQty = 0;
  for (const variantId of variantIds) {
    const requested = wanted.get(variantId)!;
    const v = variantById.get(variantId);
    const p = v ? productById.get(v.productId) : undefined;
    if (!v || v.archived || !p || p.status !== "active") {
      items.push({ variantId, quantity: 0, requestedQuantity: requested, removed: true, reason: "No longer available" });
      continue;
    }
    const unitPrice = v.price ?? p.basePrice;
    const base = {
      variantId,
      productId: p.id,
      slug: p.slug,
      title: p.title,
      variantLabel: labelFor(variantId),
      image: imageFor(variantId, p.id),
      unitPrice,
      requestedQuantity: requested,
    };
    if (p.trackInventory && (!v.available || v.quantity <= 0)) {
      items.push({ ...base, quantity: 0, maxQuantity: 0, removed: true, reason: "Out of stock" });
      continue;
    }
    let qty = requested;
    let adjusted = false;
    let maxQuantity: number | null = null;
    if (p.trackInventory) {
      maxQuantity = v.quantity;
      if (qty > v.quantity) { qty = v.quantity; adjusted = true; }
    }
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    totalQty += qty;
    items.push({ ...base, quantity: qty, lineTotal, maxQuantity, adjusted, removed: false });
  }

  const lineTotalByProduct = new Map<string, number>();
  for (const it of items) {
    if (it.removed || !it.productId || !it.lineTotal) continue;
    lineTotalByProduct.set(it.productId, (lineTotalByProduct.get(it.productId) ?? 0) + it.lineTotal);
  }

  let discount: DiscountResult | null = null;
  let freeShipping = false;
  if (discountCode && discountCode.trim()) {
    discount = await evaluateDiscount(db, discountCode.trim(), { subtotal, totalQty, lineTotalByProduct, productCategoryIds });
    if (discount.valid && discount.freeShipping) freeShipping = true;
  }
  const discountAmount = discount?.valid ? discount.amount : 0;

  let shipping = subtotal > 0 ? shipRate : 0;
  if (freeAbove != null && subtotal >= freeAbove) shipping = 0;
  if (freeShipping) shipping = 0;

  const total = Math.max(0, subtotal - discountAmount + shipping);
  return {
    items,
    subtotal,
    discount,
    discountAmount,
    shipping,
    shipRate,
    freeShippingThreshold: freeAbove,
    total,
    itemCount: totalQty,
    currency: "LKR",
  };
}

const cartValidateBody = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .max(100),
  discountCode: z.string().trim().max(60).optional(),
});

// POST /api/store/cart/validate — recompute the whole cart authoritatively.
store.post("/cart/validate", async (c) => {
  const db = createDb(c.env.DB);
  const body = parse(cartValidateBody, await c.req.json().catch(() => ({})));
  const blob = await readStoreBlob(db);
  const cart = await priceCart(db, body.items, body.discountCode, blob);
  return c.json({ cart });
});

// ---------------------------------------------------------------------------
// Checkout — creates the real order from a re-validated cart. Guest by default;
// links to the customer when a session is present. Payment is either a PayHere
// hosted redirect (hash signed here) or bank transfer with a slip upload.
// ---------------------------------------------------------------------------

// Sequential order numbers via the single-row counter (same as the dev seeder).
async function nextOrderNumber(db: Db): Promise<number> {
  const row = await db.select().from(schema.counters).where(eq(schema.counters.name, "order_number")).get();
  const next = (row?.value ?? 1000) + 1;
  if (row) await db.update(schema.counters).set({ value: next }).where(eq(schema.counters.name, "order_number"));
  else await db.insert(schema.counters).values({ name: "order_number", value: next });
  return next;
}

// PayHere request hash: md5(merchant_id + order_id + amount + currency +
// UPPER(md5(secret))), uppercased. Amount is fixed to 2 decimals, no separators.
function payhereHash(merchantId: string, orderId: string, amount: string, currency: string, secret: string): string {
  return md5(merchantId + orderId + amount + currency + md5(secret).toUpperCase()).toUpperCase();
}
const payAmount = (cents: number) => (cents / 100).toFixed(2);

const checkoutBody = z.object({
  email: z.string().email(),
  phone: z.string().min(5).max(30),
  ship: z.object({
    name: z.string().min(1).max(120),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).nullable().optional(),
    city: z.string().min(1).max(100),
    postalCode: z.string().max(20).nullable().optional(),
  }),
  items: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1).max(100),
  discountCode: z.string().trim().max(60).optional(),
  paymentMethod: z.enum(["payhere", "bank"]),
});

store.post("/checkout", sessionMiddleware, async (c) => {
  const db = createDb(c.env.DB);
  const body = parse(checkoutBody, await c.req.json().catch(() => ({})));
  const blob = await readStoreBlob(db);

  // Re-price authoritatively. If anything changed since the bag was shown,
  // bounce with the fresh cart so the storefront can show the difference.
  const cart = await priceCart(db, body.items, body.discountCode, blob);
  const purchasable = cart.items.filter((i) => !i.removed);
  const changed = cart.items.some((i) => i.removed || i.adjusted);
  if (purchasable.length === 0 || changed) {
    return c.json({ error: "Your bag changed since you reviewed it — please check it and try again.", cart }, 409);
  }
  if (cart.total <= 0) return c.json({ error: "Your bag is empty.", cart }, 409);

  // Payment method must be switched on in settings.
  if (body.paymentMethod === "payhere" && !blob.phOn) throw new HTTPException(400, { message: "Card payment isn't available right now" });
  if (body.paymentMethod === "bank" && !blob.bankOn) throw new HTTPException(400, { message: "Bank transfer isn't available right now" });

  // Discount: enforce once-per-customer now that we have the email.
  let redemption: { discountId: string } | null = null;
  if (cart.discount?.valid && cart.discountAmount > 0) {
    const d = await db.select().from(schema.discounts).where(eq(schema.discounts.code, cart.discount.code)).get();
    if (d) {
      if (d.oncePerCustomer) {
        const used = await db
          .select({ id: schema.discountRedemptions.id })
          .from(schema.discountRedemptions)
          .where(and(eq(schema.discountRedemptions.discountId, d.id), eq(schema.discountRedemptions.email, body.email)))
          .get();
        if (used) return c.json({ error: "You've already used that discount code.", cart }, 409);
      }
      redemption = { discountId: d.id };
    }
  }

  const user = c.get("user");
  const number = await nextOrderNumber(db);
  const orderId = newId();

  await db.insert(schema.orders).values({
    id: orderId,
    number,
    status: "pending",
    userId: user?.id ?? null,
    email: body.email,
    phone: body.phone,
    shipName: body.ship.name,
    shipLine1: body.ship.line1,
    shipLine2: body.ship.line2 ?? null,
    shipCity: body.ship.city,
    shipPostalCode: body.ship.postalCode ?? null,
    subtotal: cart.subtotal,
    discountAmount: cart.discountAmount,
    discountCode: cart.discount?.valid ? cart.discount.code : null,
    shippingAmount: cart.shipping,
    total: cart.total,
    paymentMethod: body.paymentMethod,
    paymentStatus: "pending",
  });

  await db.insert(schema.orderItems).values(
    purchasable.map((i) => ({
      id: newId(),
      orderId,
      productId: i.productId ?? null,
      variantId: i.variantId,
      title: i.title ?? "Item",
      variantTitle: i.variantLabel ?? null,
      sku: null,
      imageR2Key: i.image ?? null,
      unitPrice: i.unitPrice ?? 0,
      quantity: i.quantity,
    })),
  );

  // Decrement stock for tracked products only.
  const variantIds = purchasable.map((i) => i.variantId);
  const vrows = await db.select().from(schema.variants).where(inArray(schema.variants.id, variantIds)).all();
  const vById = new Map(vrows.map((v) => [v.id, v]));
  const pids = [...new Set(vrows.map((v) => v.productId))];
  const prows = pids.length
    ? await db.select({ id: schema.products.id, trackInventory: schema.products.trackInventory }).from(schema.products).where(inArray(schema.products.id, pids)).all()
    : [];
  const tracked = new Map(prows.map((p) => [p.id, p.trackInventory]));
  for (const i of purchasable) {
    const v = vById.get(i.variantId);
    if (v && tracked.get(v.productId)) {
      await db.update(schema.variants).set({ quantity: Math.max(0, v.quantity - i.quantity) }).where(eq(schema.variants.id, v.id));
    }
  }

  if (redemption) {
    await db.insert(schema.discountRedemptions).values({ id: newId(), discountId: redemption.discountId, orderId, email: body.email });
    await db.update(schema.discounts).set({ usedCount: sql`${schema.discounts.usedCount} + 1` }).where(eq(schema.discounts.id, redemption.discountId));
  }

  await db.insert(schema.orderEvents).values({ id: newId(), orderId, type: "placed", message: "Order placed", actorType: "customer" });

  const orderOut = { id: orderId, number, total: cart.total, email: body.email, paymentMethod: body.paymentMethod };

  if (body.paymentMethod === "bank") {
    return c.json({ order: orderOut, payment: { method: "bank", bankDetails: String(blob.bankDetails ?? "") } }, 201);
  }

  // PayHere hosted checkout: return the exact form the storefront auto-submits.
  const merchantId = String(blob.phId ?? "");
  const amount = payAmount(cart.total);
  const orderRef = String(number);
  const hash = payhereHash(merchantId, orderRef, amount, "LKR", c.env.PAYHERE_MERCHANT_SECRET);
  const sandbox = Boolean(blob.phSandbox);
  const storefront = c.env.STOREFRONT_URL || "http://localhost:4321";
  const [firstName, ...rest] = body.ship.name.split(" ");
  return c.json(
    {
      order: orderOut,
      payment: {
        method: "payhere",
        sandbox,
        action: sandbox ? "https://sandbox.payhere.lk/pay/checkout" : "https://www.payhere.lk/pay/checkout",
        fields: {
          merchant_id: merchantId,
          return_url: `${storefront}/orders/${number}?token=${orderId}`,
          cancel_url: `${storefront}/cart`,
          notify_url: `${c.env.APP_URL}/api/webhooks/payhere`,
          order_id: orderRef,
          items: `Order #${number}`,
          currency: "LKR",
          amount,
          first_name: firstName || body.ship.name,
          last_name: rest.join(" "),
          email: body.email,
          phone: body.phone,
          address: body.ship.line1,
          city: body.ship.city,
          country: "Sri Lanka",
          hash,
        },
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// Order confirmation + bank-slip upload. Guests authorise with the order's
// opaque id (returned by checkout); logged-in customers match by session.
// ---------------------------------------------------------------------------

const SLIP_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

async function authorizeOrder(c: Context<AppEnv>, db: Db, number: number) {
  const order = await db.select().from(schema.orders).where(eq(schema.orders.number, number)).get();
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const token = c.req.query("token") || c.req.header("x-order-token");
  const user = c.get("user");
  const owns = user && (order.userId === user.id || order.email === user.email);
  if (order.id !== token && !owns) throw new HTTPException(403, { message: "Not authorised for this order" });
  return order;
}

store.get("/orders/:number", sessionMiddleware, async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  if (!Number.isFinite(number)) throw new HTTPException(404, { message: "Order not found" });
  const order = await authorizeOrder(c, db, number);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).all();

  return c.json({
    order: {
      number: order.number,
      status: order.status,
      email: order.email,
      phone: order.phone,
      shipName: order.shipName,
      shipLine1: order.shipLine1,
      shipLine2: order.shipLine2,
      shipCity: order.shipCity,
      shipPostalCode: order.shipPostalCode,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      discountCode: order.discountCode,
      shippingAmount: order.shippingAmount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      slipUploaded: Boolean(order.slipR2Key),
      createdAt: order.createdAt,
      items: items.map((i) => ({
        title: i.title,
        variantTitle: i.variantTitle,
        image: i.imageR2Key,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
    },
  });
});

// POST /api/store/orders/:number/slip — raw image/pdf body; bank orders only.
store.post("/orders/:number/slip", sessionMiddleware, async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  if (!Number.isFinite(number)) throw new HTTPException(404, { message: "Order not found" });
  const order = await authorizeOrder(c, db, number);
  if (order.paymentMethod !== "bank") throw new HTTPException(400, { message: "This order isn't a bank transfer" });

  const contentType = (c.req.header("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = SLIP_EXT[contentType];
  if (!ext) throw new HTTPException(415, { message: "Upload a JPG, PNG, WebP or PDF" });
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) throw new HTTPException(400, { message: "Empty upload" });
  if (buf.byteLength > 5 * 1024 * 1024) throw new HTTPException(413, { message: "File is larger than 5 MB" });

  const key = `slips/${order.id}.${ext}`;
  await c.env.IMAGES.put(key, buf, { httpMetadata: { contentType } });
  await db.update(schema.orders).set({ slipR2Key: key, slipUploadedAt: Date.now(), updatedAt: Date.now() }).where(eq(schema.orders.id, order.id));
  await db.insert(schema.orderEvents).values({ id: newId(), orderId: order.id, type: "slip_uploaded", message: "Bank transfer slip uploaded", actorType: "customer" });

  return c.json({ ok: true });
});

// Verify a PayHere IPN and mark the order paid. Exported so index.ts can mount
// it at the spec path /api/webhooks/payhere.
export async function handlePayhereWebhook(c: Context<AppEnv>) {
  const db = createDb(c.env.DB);
  const form = await c.req.parseBody();
  const get = (k: string) => String(form[k] ?? "");
  const merchantId = get("merchant_id");
  const orderId = get("order_id");
  const amount = get("payhere_amount");
  const currency = get("payhere_currency");
  const statusCode = get("status_code");
  const sig = get("md5sig");

  const local = md5(merchantId + orderId + amount + currency + statusCode + md5(c.env.PAYHERE_MERCHANT_SECRET).toUpperCase()).toUpperCase();
  if (local !== sig) return c.text("invalid signature", 403);

  const number = Number(orderId);
  const order = await db.select().from(schema.orders).where(eq(schema.orders.number, number)).get();
  if (!order) return c.text("unknown order", 404);

  // status_code 2 = success; -1/-2/-3 = cancelled/failed/chargeback.
  if (statusCode === "2" && order.paymentStatus !== "paid") {
    await db.update(schema.orders).set({ status: "paid", paymentStatus: "paid", payhereRef: get("payment_id") || null, updatedAt: Date.now() }).where(eq(schema.orders.id, order.id));
    await db.insert(schema.orderEvents).values({ id: newId(), orderId: order.id, type: "payment_paid", message: "Payment received via PayHere", actorType: "system" });
  }
  return c.text("OK");
}

// ---------------------------------------------------------------------------
// Settings — public store info only (never the PayHere merchant secret).
// ---------------------------------------------------------------------------

store.get("/settings", async (c) => {
  const db = createDb(c.env.DB);
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, "store")).get();
  let blob: Record<string, unknown> = {};
  if (row) {
    try {
      blob = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      blob = {};
    }
  }

  // Whitelist: everything the storefront legitimately shows. phSecret is the
  // merchant secret used to sign PayHere requests server-side — never exposed.
  const pick = (k: string) => blob[k];
  return c.json({
    settings: {
      storeName: pick("storeName") ?? "",
      email: pick("email") ?? "",
      phone: pick("phone") ?? "",
      address: pick("address") ?? "",
      shipRate: pick("shipRate") ?? "",
      shipFree: pick("shipFree") ?? "",
      payhere: {
        enabled: Boolean(pick("phOn")),
        merchantId: pick("phId") ?? "",
        sandbox: Boolean(pick("phSandbox")),
      },
      bank: {
        enabled: Boolean(pick("bankOn")),
        details: pick("bankDetails") ?? "",
      },
      currency: "LKR",
    },
  });
});

export { store as storeRoutes };
