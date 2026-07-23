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

export { dev as devRoutes };
