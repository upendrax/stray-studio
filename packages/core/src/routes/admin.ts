import { Hono } from "hono";
import { sessionMiddleware, requireOwner } from "../middleware/auth";
import { categoryRoutes } from "./categories";
import { attributeRoutes } from "./attributes";
import { productRoutes } from "./products";
import { discountRoutes } from "./discounts";
import { orderRoutes } from "./orders";
import { settingsRoutes } from "./settings";
import type { AppEnv } from "../lib/context";

// Everything under /api/admin/* is owner-only. Resource routers
// (products, orders, discounts, …) mount here.
const admin = new Hono<AppEnv>();

admin.use("*", sessionMiddleware, requireOwner);

// Who am I — used by the Studio to confirm the session on load.
admin.get("/me", (c) => c.json({ user: c.get("user") }));

admin.route("/categories", categoryRoutes);
admin.route("/attributes", attributeRoutes);
admin.route("/products", productRoutes);
admin.route("/discounts", discountRoutes);
admin.route("/orders", orderRoutes);
admin.route("/settings", settingsRoutes);

export { admin as adminRoutes };
