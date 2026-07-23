import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import { newId } from "../lib/id";
import { parse } from "../lib/validate";
import type { AppEnv } from "../lib/context";

type Db = ReturnType<typeof createDb>;

const orders = new Hono<AppEnv>();

const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"] as const;
type Status = (typeof STATUSES)[number];

async function loadDetail(db: Db, id: string) {
  const order = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
  if (!order) return null;
  const [items, events] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)).all(),
    db
      .select()
      .from(schema.orderEvents)
      .where(eq(schema.orderEvents.orderId, id))
      .orderBy(sql`${schema.orderEvents.createdAt} desc`)
      .all(),
  ]);
  return { ...order, items, events };
}

async function findByNumber(db: Db, number: number) {
  return db.select().from(schema.orders).where(eq(schema.orders.number, number)).get();
}

// Append a timeline event. Admin actions carry the owner's id.
async function addEvent(
  db: Db,
  orderId: string,
  type: (typeof schema.orderEvents.type.enumValues)[number],
  message: string,
  actor: { type: "admin" | "customer" | "system"; id?: string } = { type: "admin" },
) {
  await db.insert(schema.orderEvents).values({
    id: newId(),
    orderId,
    type,
    message,
    actorType: actor.type,
    actorId: actor.id ?? null,
  });
}

// GET /api/admin/orders — list rows for the table.
orders.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.orders)
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .all();

  const counts = await db
    .select({
      orderId: schema.orderItems.orderId,
      itemCount: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)`,
    })
    .from(schema.orderItems)
    .groupBy(schema.orderItems.orderId)
    .all();
  const countBy = new Map(counts.map((r) => [r.orderId, r.itemCount]));

  return c.json({
    orders: rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      shipName: o.shipName,
      email: o.email,
      phone: o.phone,
      guest: o.userId === null,
      total: o.total,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      slipR2Key: o.slipR2Key,
      slipUploadedAt: o.slipUploadedAt,
      discountCode: o.discountCode,
      itemCount: countBy.get(o.id) ?? 0,
      createdAt: o.createdAt,
    })),
  });
});

// GET /api/admin/orders/:number — full detail (items + events).
orders.get("/:number", async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  if (!Number.isInteger(number)) throw new HTTPException(400, { message: "Invalid order number" });
  const order = await findByNumber(db, number);
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  return c.json({ order: await loadDetail(db, order.id) });
});

// Move stock when an order is cancelled or a cancel is reverted, so inventory
// stays honest. Only line items still linked to a variant are adjusted.
async function adjustStock(db: Db, orderId: string, direction: 1 | -1) {
  const items = await db
    .select({ variantId: schema.orderItems.variantId, quantity: schema.orderItems.quantity })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId))
    .all();
  for (const it of items) {
    if (!it.variantId) continue;
    await db
      .update(schema.variants)
      .set({ quantity: sql`${schema.variants.quantity} + ${direction * it.quantity}` })
      .where(eq(schema.variants.id, it.variantId));
  }
}

const statusBody = z.object({
  status: z.enum(STATUSES),
  message: z.string().max(300).optional(),
  courierName: z.string().max(120).nullable().optional(),
  trackingNumber: z.string().max(120).nullable().optional(),
  refundReference: z.string().max(120).nullable().optional(),
});

// POST /api/admin/orders/:number/status — status transition (also used for
// mark-paid / ship / deliver / cancel / refund / revert). Writes a timeline
// event and keeps payment status + stock consistent.
orders.post("/:number/status", async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  const order = await findByNumber(db, number);
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const b = parse(statusBody, await c.req.json().catch(() => ({})));
  const next = b.status as Status;
  const prev = order.status as Status;

  const patch: Partial<typeof schema.orders.$inferInsert> = { status: next, updatedAt: Date.now() };
  if (next === "paid") patch.paymentStatus = "paid";
  if (next === "shipped") {
    patch.courierName = b.courierName ?? order.courierName;
    patch.trackingNumber = b.trackingNumber ?? order.trackingNumber;
  }
  if (next === "refunded") {
    patch.paymentStatus = "refunded";
    if (b.refundReference !== undefined) patch.refundReference = b.refundReference;
  }

  // Keep stock consistent across the cancelled boundary.
  if (next === "cancelled" && prev !== "cancelled") await adjustStock(db, order.id, 1);
  else if (prev === "cancelled" && next !== "cancelled") await adjustStock(db, order.id, -1);

  await db.update(schema.orders).set(patch).where(eq(schema.orders.id, order.id));
  await addEvent(db, order.id, "status_changed", b.message ?? `Status changed to ${next}`, {
    type: "admin",
    id: c.get("user")?.id,
  });
  return c.json({ order: await loadDetail(db, order.id) });
});

const slipBody = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(300).optional(),
});

// POST /api/admin/orders/:number/slip — approve or reject an uploaded bank slip.
orders.post("/:number/slip", async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  const order = await findByNumber(db, number);
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const b = parse(slipBody, await c.req.json().catch(() => ({})));

  if (b.action === "approve") {
    await db
      .update(schema.orders)
      .set({ paymentStatus: "paid", status: order.status === "pending" ? "paid" : order.status, slipRejectReason: null, updatedAt: Date.now() })
      .where(eq(schema.orders.id, order.id));
    await addEvent(db, order.id, "payment_paid", "Payment approved (bank slip)", {
      type: "admin",
      id: c.get("user")?.id,
    });
  } else {
    await db
      .update(schema.orders)
      .set({ slipRejectReason: b.reason ?? "Slip rejected", updatedAt: Date.now() })
      .where(eq(schema.orders.id, order.id));
    await addEvent(db, order.id, "payment_rejected", b.reason ? `Bank slip rejected — ${b.reason}` : "Bank slip rejected", {
      type: "admin",
      id: c.get("user")?.id,
    });
  }
  return c.json({ order: await loadDetail(db, order.id) });
});

// POST /api/admin/orders/:number/note — add a timeline note.
orders.post("/:number/note", async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  const order = await findByNumber(db, number);
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const { message } = parse(z.object({ message: z.string().min(1).max(500) }), await c.req.json().catch(() => ({})));
  await addEvent(db, order.id, "note", message, { type: "admin", id: c.get("user")?.id });
  return c.json({ order: await loadDetail(db, order.id) });
});

// PATCH /api/admin/orders/:number — owner-only private note (no timeline entry).
orders.patch("/:number", async (c) => {
  const db = createDb(c.env.DB);
  const number = Number(c.req.param("number"));
  const order = await findByNumber(db, number);
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const { note } = parse(z.object({ note: z.string().max(2000).nullable() }), await c.req.json().catch(() => ({})));
  await db.update(schema.orders).set({ note: note ?? null, updatedAt: Date.now() }).where(eq(schema.orders.id, order.id));
  return c.json({ order: await loadDetail(db, order.id) });
});

export { orders as orderRoutes };
