import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, sql } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { AppEnv } from "../lib/context";

// Customers are not a table of their own — they're an aggregate over orders
// (keyed by email, which both guests and registered buyers carry), enriched
// with the account row when one exists.
const customers = new Hono<AppEnv>();

interface Agg {
  email: string;
  name: string;
  phone: string;
  address: string;
  guest: boolean;
  orderCount: number;
  spent: number; // cents, excludes cancelled/refunded
  firstOrderAt: number;
  lastOrderAt: number;
}

async function aggregate(db: ReturnType<typeof createDb>) {
  // Newest first, so the first order seen per email wins for the display fields.
  const rows = await db
    .select()
    .from(schema.orders)
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .all();
  const accounts = await db
    .select({ email: schema.user.email, createdAt: schema.user.createdAt })
    .from(schema.user)
    .where(eq(schema.user.role, "customer"))
    .all();
  const joinByEmail = new Map(accounts.map((a) => [a.email, a.createdAt]));

  const map = new Map<string, Agg>();
  for (const o of rows) {
    let c = map.get(o.email);
    if (!c) {
      c = {
        email: o.email,
        name: o.shipName,
        phone: o.phone,
        address: [o.shipLine1, o.shipLine2, o.shipCity].filter(Boolean).join(", "),
        guest: o.userId === null && !joinByEmail.has(o.email),
        orderCount: 0,
        spent: 0,
        firstOrderAt: o.createdAt,
        lastOrderAt: o.createdAt,
      };
      map.set(o.email, c);
    }
    c.orderCount++;
    if (o.status !== "cancelled" && o.status !== "refunded") c.spent += o.total;
    if (o.userId !== null) c.guest = false;
    c.firstOrderAt = Math.min(c.firstOrderAt, o.createdAt);
    c.lastOrderAt = Math.max(c.lastOrderAt, o.createdAt);
  }

  return { list: Array.from(map.values()), joinByEmail };
}

// GET /api/admin/customers — one row per buyer, biggest spender first.
customers.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const { list, joinByEmail } = await aggregate(db);
  const out = list
    .map((x) => ({ ...x, joinedAt: joinByEmail.get(x.email) ?? x.firstOrderAt }))
    .sort((a, b) => b.spent - a.spent);
  return c.json({ customers: out });
});

// GET /api/admin/customers/:email — the aggregate + that customer's orders.
customers.get("/:email", async (c) => {
  const db = createDb(c.env.DB);
  const email = decodeURIComponent(c.req.param("email"));
  const { list, joinByEmail } = await aggregate(db);
  const found = list.find((x) => x.email === email);
  if (!found) throw new HTTPException(404, { message: "Customer not found" });

  const orders = await db
    .select({
      id: schema.orders.id,
      number: schema.orders.number,
      status: schema.orders.status,
      total: schema.orders.total,
      paymentMethod: schema.orders.paymentMethod,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.email, email))
    .orderBy(sql`${schema.orders.createdAt} desc`)
    .all();

  return c.json({
    customer: { ...found, joinedAt: joinByEmail.get(found.email) ?? found.firstOrderAt, orders },
  });
});

// DELETE /api/admin/customers/:email — anonymize: scrub the contact snapshot on
// this buyer's orders (and unlink any account) so they drop out of the list,
// while the orders themselves stay intact.
customers.delete("/:email", async (c) => {
  const db = createDb(c.env.DB);
  const email = decodeURIComponent(c.req.param("email"));
  const existing = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(eq(schema.orders.email, email))
    .get();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  await db
    .update(schema.orders)
    .set({ shipName: "Deleted customer", email: "—", phone: "—", userId: null, updatedAt: Date.now() })
    .where(eq(schema.orders.email, email));
  return c.json({ ok: true });
});

export { customers as customerRoutes };
