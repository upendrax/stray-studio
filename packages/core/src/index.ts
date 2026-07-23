import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createAuth, trustedOrigins } from "./auth";
import { adminRoutes } from "./routes/admin";
import { devRoutes } from "./routes/dev";
import type { AppEnv } from "./lib/context";

const app = new Hono<AppEnv>();

// CORS — credentialed (session cookies), so origins are whitelisted, not "*".
// Wrapped because the allow-list is built from c.env.APP_URL per request.
app.use("/api/*", (c, next) =>
  cors({
    origin: trustedOrigins(c.env),
    credentials: true,
  })(c, next),
);

app.get("/api/health", (c) => c.json({ ok: true, service: "stray-core" }));

// Public image serving from R2 (product photos, category covers). Keys are
// opaque + unguessable, so reads are public — the storefront needs them too.
app.get("/api/images/*", async (c) => {
  const key = c.req.path.slice("/api/images/".length);
  if (!key) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", obj.httpEtag);
  return new Response(obj.body, { headers });
});

// Better Auth owns /api/auth/* (sign-in, OTP, sessions, sign-out…).
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  createAuth(c.env).handler(c.req.raw),
);

// Owner-only Studio API (guards session internally).
app.route("/api/admin", adminRoutes);

// Local-only bootstrap/dev helpers (404 in production).
app.route("/api/dev", devRoutes);

// Storefront API (catalog, cart validation, checkout) + PayHere webhook
// land here in later phases:
//   /api/store/*  ·  /api/webhooks/payhere

// Consistent JSON error envelope for the whole API.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[unhandled]", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
