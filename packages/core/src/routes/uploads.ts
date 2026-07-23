import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { newId } from "../lib/id";
import type { AppEnv } from "../lib/context";

const uploads = new Hono<AppEnv>();

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// POST /api/admin/uploads — store a raw image body in R2 and return its key.
// The body is the image bytes; Content-Type must be a supported image type.
// (Owner-only: mounted under /api/admin.) The public serve route is
// GET /api/images/:key.
uploads.post("/", async (c) => {
  const contentType = (c.req.header("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = EXT[contentType];
  if (!ext) {
    throw new HTTPException(415, { message: "Unsupported image type" });
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) throw new HTTPException(400, { message: "Empty upload" });
  if (body.byteLength > MAX_BYTES) {
    throw new HTTPException(413, { message: "Image is larger than 5 MB" });
  }

  const key = `uploads/${newId()}.${ext}`;
  await c.env.IMAGES.put(key, body, { httpMetadata: { contentType } });

  return c.json({ r2Key: key }, 201);
});

export { uploads as uploadRoutes };
