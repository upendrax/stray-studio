import { Hono } from "hono";
import { sessionMiddleware, requireOwner } from "../middleware/auth";
import type { AppEnv } from "../lib/context";

// Everything under /api/admin/* is owner-only. Resource routers
// (products, categories, orders, …) mount here in Backend #2.
const admin = new Hono<AppEnv>();

admin.use("*", sessionMiddleware, requireOwner);

// Who am I — used by the Studio to confirm the session on load.
admin.get("/me", (c) => c.json({ user: c.get("user") }));

export { admin as adminRoutes };
