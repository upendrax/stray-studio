import { Hono } from "hono";
import { createAuth } from "./auth";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "stray-core" }));

// Better Auth handles /api/auth/* (sign-in, OTP, sessions, sign-out…)
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw),
);

// Route modules land here next:
//   /api/admin/*  — Studio API (products, orders, discounts, customers, settings)
//   /api/store/*  — Storefront API (catalog, cart validation, checkout)
//   /api/webhooks/payhere — payment notifications

export default app;
