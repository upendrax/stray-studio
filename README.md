# Stray Studio

Lightweight, reusable ecommerce CMS + backend built for Cloudflare. One core, many client stores — each client gets an isolated deployment (Worker + D1 + R2) with a custom Astro storefront on top.

## Packages

| Package | What it is |
|---|---|
| `packages/core` (`@stray/core`) | Hono API on Cloudflare Workers — products, orders, checkout, payments (PayHere / COD / bank slip), auth (Better Auth), D1 via Drizzle, images on R2, emails via Resend. |
| `packages/studio` (`@stray/studio`) | Admin panel — React + Vite + shadcn/ui (compact `sm` density), design-token driven, light/dark. |

## Docs

- [Studio UX spec](docs/studio-ux-spec.md) — screen-by-screen admin spec (source of truth for design).

## Development

```sh
pnpm install
pnpm dev:core     # API on local workerd (wrangler dev)
pnpm dev:studio   # Admin panel (vite dev)
pnpm typecheck
```
