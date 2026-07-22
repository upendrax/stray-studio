import type { Env } from "../env";

// The authenticated principal attached to a request by sessionMiddleware.
// Shape mirrors what Better Auth's getSession returns (user + our extra fields).
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff" | "customer";
  emailVerified: boolean;
};

// Hono generic used across every router: D1/R2 bindings + per-request vars.
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser | null;
    session: { id: string } | null;
  };
};
