import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth } from "../auth";
import type { AppEnv, AuthUser } from "../lib/context";

// Loads the Better Auth session (if any) and attaches user/session to context.
// Non-fatal: routes decide whether auth is required (see requireOwner).
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const res = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  c.set("user", (res?.user as AuthUser | undefined) ?? null);
  c.set("session", res?.session ? { id: res.session.id } : null);
  await next();
};

// Gate for the Studio admin API: a signed-in owner is required.
// (Single-admin model — staff is reserved but unused in v1.)
export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Sign in required" });
  if (user.role !== "owner") {
    throw new HTTPException(403, { message: "Owner access only" });
  }
  await next();
};
