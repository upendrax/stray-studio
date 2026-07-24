import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAuth } from "../auth";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
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

// Bump the shared order-number counter (mirrors what checkout will do).
async function nextOrderNumber(db: ReturnType<typeof createDb>): Promise<number> {
  const row = await db
    .select()
    .from(schema.counters)
    .where(eq(schema.counters.name, "order_number"))
    .get();
  const next = (row?.value ?? 1000) + 1;
  if (row) {
    await db.update(schema.counters).set({ value: next }).where(eq(schema.counters.name, "order_number"));
  } else {
    await db.insert(schema.counters).values({ name: "order_number", value: next });
  }
  return next;
}

// Seed a batch of sample orders so the admin Orders/Customers pages have data
// to work with before the storefront checkout exists. Appends each call.
dev.post("/seed-orders", async (c) => {
  const db = createDb(c.env.DB);
  const now = Date.now();
  const hrs = (h: number) => now - h * 3600_000;

  // [name, email, phone, city, status, paymentMethod, paymentStatus, slip?, createdAt, lines[[title,variant,price,qty]]]
  const samples: Array<{
    name: string; email: string; phone: string; city: string;
    status: (typeof schema.orders.status.enumValues)[number];
    method: (typeof schema.orders.paymentMethod.enumValues)[number];
    payStatus: (typeof schema.orders.paymentStatus.enumValues)[number];
    slip: boolean; createdAt: number;
    lines: Array<[string, string | null, number, number]>;
  }> = [
    { name: "Nethmi Perera", email: "nethmi@example.lk", phone: "+94 77 123 4567", city: "Colombo 05", status: "pending", method: "bank", payStatus: "pending", slip: true, createdAt: hrs(3), lines: [["Oversized Tee", "Black / M", 280000, 1], ["Dad Cap", null, 150000, 2]] },
    { name: "Dilini Fernando", email: "dilini@example.lk", phone: "+94 71 234 5678", city: "Kandy", status: "paid", method: "payhere", payStatus: "paid", slip: false, createdAt: hrs(9), lines: [["Linen Camp Shirt", null, 480000, 1]] },
    { name: "Amaya Jayasuriya", email: "amaya@example.lk", phone: "+94 76 345 6789", city: "Galle", status: "shipped", method: "payhere", payStatus: "paid", slip: false, createdAt: hrs(28), lines: [["Classic Crew Tee", "White / L", 220000, 2]] },
    { name: "Ruwan Wickramasinghe", email: "ruwan@example.lk", phone: "+94 70 456 7890", city: "Negombo", status: "delivered", method: "bank", payStatus: "paid", slip: false, createdAt: hrs(96), lines: [["Ribbed Tank", null, 190000, 3]] },
    { name: "Nethmi Perera", email: "nethmi@example.lk", phone: "+94 77 123 4567", city: "Colombo 05", status: "delivered", method: "payhere", payStatus: "paid", slip: false, createdAt: hrs(240), lines: [["Canvas Tote", null, 190000, 1]] },
    { name: "Shenali Gunawardena", email: "shenali@example.lk", phone: "+94 78 567 8901", city: "Matara", status: "cancelled", method: "payhere", payStatus: "refunded", slip: false, createdAt: hrs(400), lines: [["Boxy Heavyweight Tee", "Ecru / L", 320000, 1]] },
  ];

  const created: number[] = [];
  for (const s of samples) {
    const subtotal = s.lines.reduce((sum, [, , price, qty]) => sum + price * qty, 0);
    const shipping = subtotal >= 500000 ? 0 : 40000;
    const total = subtotal + shipping;
    const id = newId();
    const number = await nextOrderNumber(db);
    await db.insert(schema.orders).values({
      id, number, status: s.status, email: s.email, phone: s.phone,
      shipName: s.name, shipLine1: "No. 1, Main Street", shipCity: s.city,
      subtotal, shippingAmount: shipping, total,
      paymentMethod: s.method, paymentStatus: s.payStatus,
      slipR2Key: s.slip ? `slips/${id}.jpg` : null,
      slipUploadedAt: s.slip ? s.createdAt : null,
      createdAt: s.createdAt, updatedAt: s.createdAt,
    });
    await db.insert(schema.orderItems).values(
      s.lines.map(([title, variant, price, qty]) => ({
        id: newId(), orderId: id, title, variantTitle: variant, unitPrice: price, quantity: qty,
      })),
    );
    await db.insert(schema.orderEvents).values({
      id: newId(), orderId: id, type: "placed", message: "Order placed", actorType: "customer", createdAt: s.createdAt,
    });
    if (s.slip) {
      await db.insert(schema.orderEvents).values({
        id: newId(), orderId: id, type: "slip_uploaded", message: "Bank transfer slip uploaded", actorType: "customer", createdAt: s.createdAt + 60_000,
      });
    }
    created.push(number);
  }

  return c.json({ ok: true, created });
});

// ---------------------------------------------------------------------------
// Sample catalog — attributes, categories, and simple+variable products (all
// active), with SVG placeholder images written straight to R2. Lets the
// storefront be built against real data before the owner adds products in the
// Studio. Idempotent: products whose slug already exists are skipped.
// ---------------------------------------------------------------------------

type SeedDb = ReturnType<typeof createDb>;

// A tall product-card placeholder: solid colour block + centered label.
async function putPlaceholder(env: AppEnv["Bindings"], key: string, label: string, bg: string, fg: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">` +
    `<rect width="800" height="1000" fill="${bg}"/>` +
    `<text x="400" y="510" font-family="system-ui,sans-serif" font-size="44" fill="${fg}" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  await env.IMAGES.put(key, svg, { httpMetadata: { contentType: "image/svg+xml" } });
}

// Get an attribute by name or create it (avoids the unique-name conflict on
// re-seed). Returns the attribute id plus a value-name -> valueId map.
async function upsertAttribute(
  db: SeedDb,
  name: string,
  opts: { useImages?: boolean; useColor?: boolean; position: number },
  values: Array<{ value: string; color?: string }>,
) {
  let attr = await db.select().from(schema.attributes).where(eq(schema.attributes.name, name)).get();
  if (!attr) {
    const id = newId();
    await db.insert(schema.attributes).values({
      id, name, useImages: opts.useImages ?? false, useColor: opts.useColor ?? false, position: opts.position,
    });
    attr = await db.select().from(schema.attributes).where(eq(schema.attributes.id, id)).get();
  }
  const attrId = attr!.id;
  const existing = await db.select().from(schema.attributeValues).where(eq(schema.attributeValues.attributeId, attrId)).all();
  const byName = new Map(existing.map((v) => [v.value, v.id]));
  for (const [i, v] of values.entries()) {
    if (!byName.has(v.value)) {
      const id = newId();
      await db.insert(schema.attributeValues).values({ id, attributeId: attrId, value: v.value, color: v.color ?? null, position: i });
      byName.set(v.value, id);
    }
  }
  return { attrId, valueIds: byName };
}

async function upsertCategory(db: SeedDb, name: string, slug: string, parentId: string | null) {
  const existing = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get();
  if (existing) return existing.id;
  const id = newId();
  await db.insert(schema.categories).values({ id, name, slug, parentId });
  return id;
}

dev.post("/seed-catalog", async (c) => {
  const db = createDb(c.env.DB);

  // Colour swatches (hex) — used for the storefront colour selector + per-colour
  // placeholder images.
  const colours: Record<string, string> = {
    Black: "#111827", White: "#f4f4f5", Ecru: "#d9cdb8", Olive: "#5b6236", Navy: "#1e293b",
  };
  const colour = await upsertAttribute(
    db, "Color", { useImages: true, useColor: true, position: 0 },
    Object.entries(colours).map(([value, color]) => ({ value, color })),
  );
  const size = await upsertAttribute(
    db, "Size", { position: 1 },
    ["S", "M", "L", "XL"].map((value) => ({ value })),
  );

  const tops = await upsertCategory(db, "Tops", "tops", null);
  const tees = await upsertCategory(db, "Tees", "tees", tops);
  const shirts = await upsertCategory(db, "Shirts", "shirts", tops);
  const accessories = await upsertCategory(db, "Accessories", "accessories", null);

  // label used inside the placeholder image
  const textFor = (name: string) => (["White", "Ecru"].includes(name) ? "#111827" : "#f4f4f5");

  type SeedProduct = {
    title: string; slug: string; basePrice: number; compareAt?: number;
    categoryIds: string[]; description: string;
    colours?: string[]; sizes?: string[]; // present => variable
    simpleQty?: number; // simple product stock
  };

  const seeds: SeedProduct[] = [
    { title: "Oversized Tee", slug: "oversized-tee", basePrice: 280000, compareAt: 350000, categoryIds: [tees], colours: ["Black", "White", "Ecru"], sizes: ["S", "M", "L", "XL"], description: "Heavyweight 240gsm cotton with a relaxed, boxy drop-shoulder fit." },
    { title: "Linen Camp Shirt", slug: "linen-camp-shirt", basePrice: 480000, categoryIds: [shirts], colours: ["Ecru", "Olive"], sizes: ["S", "M", "L"], description: "Breathable pure-linen camp collar shirt for warm Colombo evenings." },
    { title: "Classic Crew Tee", slug: "classic-crew-tee", basePrice: 220000, categoryIds: [tees], colours: ["White", "Black", "Navy"], sizes: ["S", "M", "L", "XL"], description: "The everyday crew neck in soft combed cotton." },
    { title: "Dad Cap", slug: "dad-cap", basePrice: 150000, categoryIds: [accessories], simpleQty: 40, description: "Six-panel unstructured cap with an adjustable strap." },
    { title: "Canvas Tote", slug: "canvas-tote", basePrice: 190000, categoryIds: [accessories], simpleQty: 25, description: "Sturdy 12oz cotton canvas tote that carries a week of market runs." },
    { title: "Ribbed Tank", slug: "ribbed-tank", basePrice: 190000, categoryIds: [tees], simpleQty: 30, description: "Slim ribbed tank in a stretch cotton blend." },
  ];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const s of seeds) {
    const exists = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, s.slug)).get();
    if (exists) { skipped.push(s.slug); continue; }

    const productId = newId();
    const isVariable = Boolean(s.colours && s.sizes);
    await db.insert(schema.products).values({
      id: productId, title: s.title, slug: s.slug, description: s.description,
      status: "active", hasOptions: isVariable, basePrice: s.basePrice, compareAtPrice: s.compareAt ?? null,
    });
    for (const categoryId of s.categoryIds) {
      await db.insert(schema.productCategories).values({ productId, categoryId });
    }

    if (!isVariable) {
      // Simple product: one default variant + one default image.
      const imgKey = `seed/${productId}.svg`;
      await putPlaceholder(c.env, imgKey, s.title, "#e7e5e4", "#111827");
      await db.insert(schema.productImages).values({ id: newId(), productId, r2Key: imgKey, sortOrder: 0 });
      await db.insert(schema.variants).values({ id: newId(), productId, price: null, quantity: s.simpleQty ?? 20, available: true, position: 0 });
      created.push(s.slug);
      continue;
    }

    // Variable product: Color × Size grid, per-colour image + swatch.
    const colourOptionId = newId();
    await db.insert(schema.productOptions).values({ id: colourOptionId, productId, attributeId: colour.attrId, position: 0 });
    const sizeOptionId = newId();
    await db.insert(schema.productOptions).values({ id: sizeOptionId, productId, attributeId: size.attrId, position: 1 });

    // Colour option values (+ per-value placeholder image), map attrValueId -> pov.id
    const colourPov = new Map<string, string>();
    for (const [i, name] of s.colours!.entries()) {
      const attrValueId = colour.valueIds.get(name)!;
      const povId = newId();
      colourPov.set(attrValueId, povId);
      await db.insert(schema.productOptionValues).values({ id: povId, optionId: colourOptionId, attributeValueId: attrValueId, position: i });
      const imgKey = `seed/${productId}-${name.toLowerCase()}.svg`;
      await putPlaceholder(c.env, imgKey, `${s.title} — ${name}`, colours[name]!, textFor(name));
      await db.insert(schema.optionValueImages).values({ id: newId(), optionValueId: povId, r2Key: imgKey, sortOrder: 0 });
      // Also seed the product-level gallery from the first colour.
      if (i === 0) await db.insert(schema.productImages).values({ id: newId(), productId, r2Key: imgKey, sortOrder: 0 });
    }
    const sizePov = new Map<string, string>();
    for (const [i, name] of s.sizes!.entries()) {
      const attrValueId = size.valueIds.get(name)!;
      const povId = newId();
      sizePov.set(attrValueId, povId);
      await db.insert(schema.productOptionValues).values({ id: povId, optionId: sizeOptionId, attributeValueId: attrValueId, position: i });
    }

    // Cartesian variants. Vary stock a little; make one combo out of stock.
    let pos = 0;
    for (const cName of s.colours!) {
      for (const zName of s.sizes!) {
        const cAttrValue = colour.valueIds.get(cName)!;
        const zAttrValue = size.valueIds.get(zName)!;
        const variantId = newId();
        const qty = zName === "XL" && cName === s.colours![0] ? 0 : 5 + ((pos * 3) % 11);
        await db.insert(schema.variants).values({ id: variantId, productId, price: null, quantity: qty, available: true, position: pos++ });
        await db.insert(schema.variantOptionValues).values([
          { variantId, optionValueId: colourPov.get(cAttrValue)! },
          { variantId, optionValueId: sizePov.get(zAttrValue)! },
        ]);
      }
    }
    created.push(s.slug);
  }

  // Ensure the store settings are checkout-ready in dev (shipping + both
  // payment methods on). Existing owner-set values win; we only fill blanks
  // and force phOn/bankOn true so the storefront checkout is testable.
  const settingsRow = await db.select().from(schema.settings).where(eq(schema.settings.key, "store")).get();
  let storeBlob: Record<string, unknown> = {};
  if (settingsRow) { try { storeBlob = JSON.parse(settingsRow.value); } catch { storeBlob = {}; } }
  const defaults = {
    storeName: "Stray Studio", email: "hello@stray.lk", phone: "+94 11 234 5678",
    address: "No. 48, Galle Road\nColombo 03", shipRate: "400", shipFree: "10000",
    phId: "1224753", phSecret: "sandbox-secret", phSandbox: true,
    bankDetails: "Commercial Bank — Kollupitiya\nStray Studio (Pvt) Ltd\nA/C 8001234567",
  };
  const mergedBlob = { ...defaults, ...storeBlob, phOn: true, bankOn: true };
  const value = JSON.stringify(mergedBlob);
  if (settingsRow) await db.update(schema.settings).set({ value, updatedAt: Date.now() }).where(eq(schema.settings.key, "store"));
  else await db.insert(schema.settings).values({ key: "store", value });

  // A sample order-wide discount so the storefront cart/checkout can be tested.
  const code = "WELCOME10";
  const hasDiscount = await db.select({ id: schema.discounts.id }).from(schema.discounts).where(eq(schema.discounts.code, code)).get();
  if (!hasDiscount) {
    await db.insert(schema.discounts).values({
      id: newId(), code, type: "percent", value: 10, applies: "order",
      minType: "none", enabled: true, startsAt: Date.now() - 86_400_000,
    });
  }

  return c.json({ ok: true, created, skipped, discount: code });
});

export { dev as devRoutes };
