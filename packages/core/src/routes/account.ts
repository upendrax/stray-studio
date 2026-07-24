import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { parse } from "../lib/validate";
import { sessionMiddleware, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../lib/context";

// Storefront customer account: profile, order history, saved addresses. Every
// route requires a signed-in user (email-OTP session). Orders are matched by
// account id OR email, so guest orders placed with the same email show up once
// the customer signs in.
const account = new Hono<AppEnv>();
account.use("*", sessionMiddleware, requireAuth);

account.get("/me", (c) => {
  const user = c.get("user")!;
  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});

// Order history (summary rows).
account.get("/orders", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const rows = await db
    .select()
    .from(schema.orders)
    .where(or(eq(schema.orders.userId, user.id), eq(schema.orders.email, user.email)))
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .all();

  const ids = rows.map((o) => o.id);
  const counts = new Map<string, number>();
  const firstImage = new Map<string, string>();
  if (ids.length) {
    const items = await db.select().from(schema.orderItems).all();
    for (const it of items) {
      if (!ids.includes(it.orderId)) continue;
      counts.set(it.orderId, (counts.get(it.orderId) ?? 0) + it.quantity);
      if (it.imageR2Key && !firstImage.has(it.orderId)) firstImage.set(it.orderId, it.imageR2Key);
    }
  }

  return c.json({
    orders: rows.map((o) => ({
      number: o.number,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      itemCount: counts.get(o.id) ?? 0,
      image: firstImage.get(o.id) ?? null,
      createdAt: o.createdAt,
    })),
  });
});

// A single order the customer owns.
account.get("/orders/:number", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const number = Number(c.req.param("number"));
  if (!Number.isFinite(number)) throw new HTTPException(404, { message: "Order not found" });

  const order = await db.select().from(schema.orders).where(eq(schema.orders.number, number)).get();
  if (!order || (order.userId !== user.id && order.email !== user.email)) {
    throw new HTTPException(404, { message: "Order not found" });
  }
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

// --- Addresses ----------------------------------------------------------

const addressBody = z.object({
  label: z.string().max(60).nullable().optional(),
  recipientName: z.string().min(1).max(120),
  phone: z.string().min(5).max(30),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100),
  postalCode: z.string().max(20).nullable().optional(),
  isDefault: z.boolean().optional(),
});

account.get("/addresses", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const rows = await db
    .select()
    .from(schema.addresses)
    .where(eq(schema.addresses.userId, user.id))
    .orderBy(sql`${schema.addresses.isDefault} desc`, schema.addresses.createdAt)
    .all();
  return c.json({ addresses: rows });
});

account.post("/addresses", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const body = parse(addressBody, await c.req.json().catch(() => ({})));

  // First address is default by default.
  const existing = await db.select({ id: schema.addresses.id }).from(schema.addresses).where(eq(schema.addresses.userId, user.id)).all();
  const isDefault = body.isDefault ?? existing.length === 0;
  if (isDefault && existing.length) {
    await db.update(schema.addresses).set({ isDefault: false }).where(eq(schema.addresses.userId, user.id));
  }

  const id = newId();
  await db.insert(schema.addresses).values({
    id,
    userId: user.id,
    label: body.label ?? null,
    recipientName: body.recipientName,
    phone: body.phone,
    line1: body.line1,
    line2: body.line2 ?? null,
    city: body.city,
    postalCode: body.postalCode ?? null,
    isDefault,
  });
  const created = await db.select().from(schema.addresses).where(eq(schema.addresses.id, id)).get();
  return c.json({ address: created }, 201);
});

account.patch("/addresses/:id", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = parse(addressBody.partial(), await c.req.json().catch(() => ({})));

  const existing = await db.select().from(schema.addresses).where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, user.id))).get();
  if (!existing) throw new HTTPException(404, { message: "Address not found" });

  if (body.isDefault) {
    await db.update(schema.addresses).set({ isDefault: false }).where(eq(schema.addresses.userId, user.id));
  }
  const patch: Partial<typeof schema.addresses.$inferInsert> = {};
  for (const k of ["label", "recipientName", "phone", "line1", "line2", "city", "postalCode", "isDefault"] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k] ?? null;
  }
  await db.update(schema.addresses).set(patch).where(eq(schema.addresses.id, id));
  const updated = await db.select().from(schema.addresses).where(eq(schema.addresses.id, id)).get();
  return c.json({ address: updated });
});

account.delete("/addresses/:id", async (c) => {
  const db = createDb(c.env.DB);
  const user = c.get("user")!;
  const id = c.req.param("id");
  const existing = await db.select().from(schema.addresses).where(and(eq(schema.addresses.id, id), eq(schema.addresses.userId, user.id))).get();
  if (!existing) throw new HTTPException(404, { message: "Address not found" });
  await db.delete(schema.addresses).where(eq(schema.addresses.id, id));

  // Promote another address to default if we removed the default one.
  if (existing.isDefault) {
    const next = await db.select({ id: schema.addresses.id }).from(schema.addresses).where(eq(schema.addresses.userId, user.id)).orderBy(schema.addresses.createdAt).get();
    if (next) await db.update(schema.addresses).set({ isDefault: true }).where(eq(schema.addresses.id, next.id));
  }
  return c.json({ ok: true });
});

export { account as accountRoutes };
