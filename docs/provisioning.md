# Provisioning a new store

Each client gets an isolated deploy — its own D1 database, R2 bucket, secrets,
and two Workers (the `@stray/core` API + admin, and the `@stray/storefront-kit`
Astro storefront). Everything fits the Cloudflare free tier per client.

`scripts/provision.mjs` automates it end to end.

## Prerequisites

- `pnpm install` at the repo root.
- Wrangler authenticated against the client's Cloudflare account:
  `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`).
- A client config (copy `scripts/clients/example.json`).

## 1. Write the client config

`scripts/clients/<slug>.json` (real configs are git-ignored):

```json
{
  "slug": "acme",
  "storeName": "Acme Apparel",
  "core":       { "name": "acme-core", "url": "https://api.acme.lk", "customDomain": "api.acme.lk", "d1Name": "acme-db", "r2Bucket": "acme-images" },
  "storefront": { "name": "acme-shop", "url": "https://acme.lk",     "customDomain": "acme.lk" },
  "owner":      { "email": "owner@acme.lk", "name": "Acme Owner" },
  "secrets":    { "RESEND_API_KEY": "", "PAYHERE_MERCHANT_SECRET": "" }
}
```

- `core.url` / `storefront.url` are the public URLs the apps use for CORS,
  PayHere callbacks, and API calls. Use the real domains (or `*.workers.dev`).
- `customDomain` (optional) attaches a Cloudflare custom domain route to the
  Worker. Omit to use the generated `*.workers.dev` URL (match it in `url`).
- **For customer OTP login, the storefront and API should be subdomains of one
  registrable domain** (e.g. `acme.lk` + `api.acme.lk`) so the session cookie
  flows. Otherwise enable Better Auth cross-subdomain cookies.
- Secrets can live in the config, or be passed via the environment
  (`RESEND_API_KEY`, `PAYHERE_MERCHANT_SECRET`) at run time. Leaving them blank
  deploys a working store with email/card-pay disabled until they're set.
  `BETTER_AUTH_SECRET` and the one-time `PROVISION_TOKEN` are generated.

## 2. Preview

```bash
node scripts/provision.mjs plan      --client scripts/clients/acme.json
node scripts/provision.mjs configure --client scripts/clients/acme.json   # writes wrangler.<slug>.jsonc only
node scripts/provision.mjs up        --client scripts/clients/acme.json   # DRY RUN — prints every command
```

`up` is a **dry run by default**: it generates the config files and prints every
command it would run, but creates no cloud resources.

## 3. Deploy for real

```bash
node scripts/provision.mjs up --client scripts/clients/acme.json --execute
```

Steps performed:

1. `d1 create` + `r2 bucket create` (the D1 id is captured to
   `scripts/clients/<slug>.state.json`).
2. Generate `packages/core/wrangler.<slug>.jsonc` and
   `packages/storefront-kit/wrangler.<slug>.jsonc`.
3. Set secrets on the core Worker (piped via stdin).
4. Apply D1 migrations (`--remote`).
5. Build the storefront, then deploy both Workers.
6. Bootstrap the owner via `POST /api/provision/seed-owner` (guarded by the
   one-time `PROVISION_TOKEN`). A temp password is printed — share it securely.
7. Delete `PROVISION_TOKEN` so the bootstrap route goes back to 404.

## After provisioning

- Point the custom domains' DNS at the Workers (Cloudflare dashboard) if not
  using `customDomain` routes.
- The owner signs in at `<core.url>` (the admin Studio) and changes the temp
  password.
- Re-deploying later: `npx wrangler deploy -c wrangler.<slug>.jsonc` inside the
  relevant package (configs persist locally, git-ignored).
