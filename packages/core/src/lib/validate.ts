import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

// Parse untrusted input against a Zod schema; on failure throw a 400 that the
// global onError turns into { error } JSON. Keeps route handlers terse.
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    throw new HTTPException(400, { message: msg || "Invalid input" });
  }
  return r.data;
}
