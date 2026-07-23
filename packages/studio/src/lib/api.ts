// Thin fetch wrapper for the core API. Same-origin in dev (Vite proxies /api
// to the wrangler Worker) and in prod (Studio is served by the same Worker);
// VITE_API_URL overrides the base for split deployments.
const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      (data && typeof data === "object" && "message" in data && (data as { message?: string }).message) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(res.status, String(msg));
  }
  return data as T;
}

// Upload a raw image body to R2 and get its key back. Sent as the file's own
// content-type (not JSON), so it can't go through `request`.
async function uploadImage(file: File | Blob): Promise<{ r2Key: string }> {
  const res = await fetch(BASE + "/api/admin/uploads", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      res.statusText ||
      "Upload failed";
    throw new ApiError(res.status, String(msg));
  }
  return data as { r2Key: string };
}

// Public URL for an R2 image key (same-origin; Vite proxies /api in dev).
export const imageUrl = (key: string): string => `${BASE}/api/images/${key}`;

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: uploadImage,
};
