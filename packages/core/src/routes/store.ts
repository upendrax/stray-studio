import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Db } from "../db";
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
