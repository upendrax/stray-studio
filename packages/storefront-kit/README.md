# @stray/storefront-kit

The reusable Astro storefront for Stray Studio — SSR on Cloudflare Workers,
themed per client via CSS variables. Reads catalog, cart validation and
checkout from a client's `@stray/core` API Worker over `/api/store/*`.

## Status

- **Catalog** — home, shop-all (sort + category filter), collection pages, and
  product detail with a client-side variant selector (colour swatches + size
  pills, live price/stock, colour-driven gallery). ✅
- **Bag** — localStorage lines + header count; `/cart` shows a preview.
  Server-validated cart + checkout land in the next milestone.
- **Account / checkout / provisioning** — not started.

## Local development

The storefront reads from a running core API. From the repo root:

```bash
# 1. Core API (D1 + R2) on :8787
pnpm --filter @stray/core dev

# 2. Seed a sample catalog (attributes, categories, products, R2 placeholders)
curl -X POST http://localhost:8787/api/dev/seed-catalog

# 3. Storefront on :4321
pnpm --filter @stray/storefront-kit dev
```

`STORE_API_URL` selects the core Worker (default `http://localhost:8787`); set
it per client in `wrangler.jsonc` / `.dev.vars`.

## Theming

All colour and type tokens are CSS variables in `src/styles/global.css`
(`--color-*`, `--font-*`). A client project overrides them in a later-loaded
stylesheet — no component changes needed. Brand copy (hero, footer) lives in
`src/lib/config.ts`.

## Build

```bash
pnpm --filter @stray/storefront-kit build     # → dist/_worker.js (Cloudflare)
```

> Deploy note: the Cloudflare adapter auto-enables Astro Sessions and expects a
> `SESSION` KV binding. Harmless until the account pages use sessions — add the
> binding (or disable sessions) before the account milestone ships.
