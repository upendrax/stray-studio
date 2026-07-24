import type { Category, OrderConfirmation, ProductCard, ProductDetail, StoreSettings } from "./types";

// Resolve the core API base. In production each client's storefront Worker sets
// STORE_API_URL (read from the Cloudflare runtime env); dev falls back to the
// local wrangler dev on :8787.
export function apiBase(locals?: App.Locals): string {
  const runtimeEnv = locals?.runtime?.env?.STORE_API_URL;
  return (
    runtimeEnv ||
    import.meta.env.STORE_API_URL ||
    import.meta.env.PUBLIC_STORE_API_URL ||
    "http://localhost:8787"
  );
}

export class NotFoundError extends Error {}

async function getJson<T>(base: string, path: string): Promise<T> {
  const res = await fetch(base + path, { headers: { Accept: "application/json" } });
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`Store API responded ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export type ProductQuery = {
  category?: string;
  sort?: "newest" | "price-asc" | "price-desc";
  limit?: number;
  offset?: number;
};

function query(params: ProductQuery = {}): string {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.sort) q.set("sort", params.sort);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// A per-request API client bound to the resolved base URL.
export function createApi(base: string) {
  return {
    base,
    imageUrl(key: string | null | undefined): string | null {
      return key ? `${base}/api/images/${key}` : null;
    },
    settings(): Promise<StoreSettings> {
      return getJson<{ settings: StoreSettings }>(base, "/api/store/settings").then((r) => r.settings);
    },
    categories(): Promise<Category[]> {
      return getJson<{ categories: Category[] }>(base, "/api/store/categories").then((r) => r.categories);
    },
    products(params?: ProductQuery): Promise<{ products: ProductCard[]; total: number }> {
      return getJson<{ products: ProductCard[]; total: number }>(base, `/api/store/products${query(params)}`);
    },
    product(slug: string): Promise<ProductDetail> {
      return getJson<{ product: ProductDetail }>(base, `/api/store/products/${encodeURIComponent(slug)}`).then((r) => r.product);
    },
    collection(slug: string, params?: ProductQuery): Promise<{ category: Category; products: ProductCard[] }> {
      return getJson<{ category: Category; products: ProductCard[] }>(base, `/api/store/categories/${encodeURIComponent(slug)}${query(params)}`);
    },
    order(number: string | number, token: string): Promise<OrderConfirmation> {
      return getJson<{ order: OrderConfirmation }>(base, `/api/store/orders/${number}?token=${encodeURIComponent(token)}`).then((r) => r.order);
    },
  };
}

export type Api = ReturnType<typeof createApi>;

// Convenience for an Astro page: `const api = apiFor(Astro)`.
export function apiFor(astro: { locals: App.Locals }): Api {
  return createApi(apiBase(astro.locals));
}
