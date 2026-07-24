#!/usr/bin/env node
// Per-client provisioning for Stray Studio.
//
// Stands up an isolated deploy for one store: its own D1 database, R2 bucket,
// secrets, migrations, and two Workers (core API + Astro storefront), then
// bootstraps the owner account. Each store is fully isolated on the free tier.
//
//   node scripts/provision.mjs plan       --client clients/acme.json
//   node scripts/provision.mjs configure  --client clients/acme.json
//   node scripts/provision.mjs up         --client clients/acme.json [--execute]
//
// `up` is a DRY RUN by default — it prints every command it would run and
// generates the config files, but touches no cloud resources. Add --execute to
// actually create resources and deploy. Wrangler must already be authenticated
// (`wrangler login`) against the target Cloudflare account.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CORE_DIR = join(ROOT, "packages", "core");
const STORE_DIR = join(ROOT, "packages", "storefront-kit");
const STATE_DIR = join(__dirname, "clients");

// ---- CLI parsing -------------------------------------------------------
const [, , command, ...rest] = process.argv;
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--client") flags.client = rest[++i];
  else if (rest[i] === "--execute") flags.execute = true;
}
const DRY = !flags.execute;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!command || !["plan", "configure", "up"].includes(command)) {
  die("Usage: provision <plan|configure|up> --client <config.json> [--execute]");
}
if (!flags.client) die("Missing --client <config.json>");

// ---- Config ------------------------------------------------------------
const configPath = resolve(process.cwd(), flags.client);
if (!existsSync(configPath)) die(`Config not found: ${configPath}`);
const cfg = JSON.parse(readFileSync(configPath, "utf8"));

function required(path, val) {
  if (val === undefined || val === null || val === "") die(`Config missing "${path}"`);
  return val;
}
const slug = required("slug", cfg.slug);
const core = required("core", cfg.core);
const store = required("storefront", cfg.storefront);
required("core.name", core.name);
required("core.url", core.url);
required("core.d1Name", core.d1Name);
required("core.r2Bucket", core.r2Bucket);
required("storefront.name", store.name);
required("storefront.url", store.url);
required("owner.email", cfg.owner?.email);

// Secrets: explicit config wins, else environment, else generated/blank.
const secrets = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
  PROVISION_TOKEN: randomBytes(24).toString("hex"),
  RESEND_API_KEY: cfg.secrets?.RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? "",
  PAYHERE_MERCHANT_SECRET: cfg.secrets?.PAYHERE_MERCHANT_SECRET ?? process.env.PAYHERE_MERCHANT_SECRET ?? "",
};
const ownerPassword = cfg.owner?.password || randomBytes(9).toString("base64url");

// ---- Shell helper ------------------------------------------------------
// In dry-run, prints the command and returns "". With --execute, runs it and
// returns stdout (throwing on failure). `input` is piped to stdin (secrets).
function sh(cmd, args, { cwd = ROOT, input, label } = {}) {
  const pretty = `${cmd} ${args.join(" ")}`;
  console.log(`  ${DRY ? "» would run:" : "»"} ${label ?? pretty}${cwd !== ROOT ? `   (in ${cwd.replace(ROOT, ".")})` : ""}`);
  if (DRY) return "";
  const res = spawnSync(cmd, args, { cwd, input, encoding: "utf8", shell: true });
  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    die(`Command failed: ${pretty}`);
  }
  return res.stdout ?? "";
}
const wrangler = (dir, args, opts) => sh("npx", ["wrangler", ...args], { cwd: dir, ...opts });

// ---- State (captures the created D1 id) --------------------------------
function stateFile() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  return join(STATE_DIR, `${slug}.state.json`);
}
function readState() {
  const f = stateFile();
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
}
function writeState(patch) {
  const f = stateFile();
  const next = { ...readState(), ...patch };
  writeFileSync(f, JSON.stringify(next, null, 2));
  return next;
}

// ---- Config generation -------------------------------------------------
function coreConfig(databaseId) {
  const config = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: core.name,
    main: "src/index.ts",
    compatibility_date: "2026-07-01",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: [{ binding: "DB", database_name: core.d1Name, database_id: databaseId || "SET_BY_CREATE", migrations_dir: "drizzle" }],
    r2_buckets: [{ binding: "IMAGES", bucket_name: core.r2Bucket }],
    vars: { APP_URL: core.url, STOREFRONT_URL: store.url },
  };
  if (core.customDomain) config.routes = [{ pattern: core.customDomain, custom_domain: true }];
  return config;
}
function storeConfig() {
  const config = {
    $schema: "node_modules/wrangler/config-schema.json",
    name: store.name,
    main: "./dist/_worker.js/index.js",
    compatibility_date: "2026-07-01",
    compatibility_flags: ["nodejs_compat"],
    assets: { directory: "./dist", binding: "ASSETS" },
    vars: { STORE_API_URL: core.url },
  };
  if (store.customDomain) config.routes = [{ pattern: store.customDomain, custom_domain: true }];
  return config;
}
function writeConfigs(databaseId) {
  const header = `// GENERATED for "${slug}" by scripts/provision.mjs — do not edit by hand.\n`;
  const corePath = join(CORE_DIR, `wrangler.${slug}.jsonc`);
  const storePath = join(STORE_DIR, `wrangler.${slug}.jsonc`);
  writeFileSync(corePath, header + JSON.stringify(coreConfig(databaseId), null, 2) + "\n");
  writeFileSync(storePath, header + JSON.stringify(storeConfig(), null, 2) + "\n");
  console.log(`  ✓ wrote ${corePath.replace(ROOT, ".")}`);
  console.log(`  ✓ wrote ${storePath.replace(ROOT, ".")}`);
  return { corePath, storePath };
}
const coreCfgName = `wrangler.${slug}.jsonc`;
const storeCfgName = `wrangler.${slug}.jsonc`;

// ---- Commands ----------------------------------------------------------
function printPlan() {
  console.log(`\nProvision plan — ${cfg.storeName ?? slug}\n${"─".repeat(48)}`);
  console.log(`  slug            ${slug}`);
  console.log(`  core Worker     ${core.name}   → ${core.url}`);
  console.log(`  storefront      ${store.name}   → ${store.url}`);
  console.log(`  D1 database     ${core.d1Name}`);
  console.log(`  R2 bucket       ${core.r2Bucket}`);
  console.log(`  owner           ${cfg.owner.email}`);
  console.log(`  secrets set     BETTER_AUTH_SECRET (gen), PROVISION_TOKEN (gen),`);
  console.log(`                  RESEND_API_KEY ${secrets.RESEND_API_KEY ? "(provided)" : "(BLANK — emails off)"},`);
  console.log(`                  PAYHERE_MERCHANT_SECRET ${secrets.PAYHERE_MERCHANT_SECRET ? "(provided)" : "(BLANK — card pay off)"}`);
  console.log(`\n  Steps: create D1+R2 → write configs → set secrets → migrate → deploy → seed owner → revoke token`);
  console.log(`${"─".repeat(48)}\n`);
}

function extractDatabaseId(output) {
  const m = output.match(/database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/i) || output.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  return m ? m[1] : null;
}

async function up() {
  printPlan();
  if (DRY) console.log("DRY RUN — no cloud changes. Re-run with --execute to apply.\n");

  // 1. Resources
  console.log("1) Cloud resources");
  let databaseId = core.databaseId || readState().databaseId;
  if (databaseId) {
    console.log(`  · reusing D1 id ${databaseId}`);
  } else {
    const out = wrangler(CORE_DIR, ["d1", "create", core.d1Name]);
    databaseId = DRY ? "DRY-RUN-DATABASE-ID" : extractDatabaseId(out);
    if (!DRY && !databaseId) die("Couldn't parse database_id from `d1 create` output");
    if (!DRY) writeState({ databaseId });
  }
  wrangler(CORE_DIR, ["r2", "bucket", "create", core.r2Bucket]);

  // 2. Configs
  console.log("2) Wrangler configs");
  writeConfigs(databaseId);

  // 3. Secrets (piped via stdin)
  console.log("3) Secrets → core Worker");
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) { console.log(`  · skip ${name} (blank)`); continue; }
    wrangler(CORE_DIR, ["secret", "put", name, "-c", coreCfgName], { input: value + "\n", label: `wrangler secret put ${name} -c ${coreCfgName}` });
  }

  // 4. Migrate
  console.log("4) Database migrations (remote)");
  wrangler(CORE_DIR, ["d1", "migrations", "apply", core.d1Name, "--remote", "-c", coreCfgName]);

  // 5. Deploy
  console.log("5) Build + deploy");
  sh("pnpm", ["--filter", "@stray/storefront-kit", "build"], { label: "pnpm --filter @stray/storefront-kit build" });
  wrangler(CORE_DIR, ["deploy", "-c", coreCfgName]);
  wrangler(STORE_DIR, ["deploy", "-c", storeCfgName]);

  // 6. Seed owner (via the token-guarded endpoint on the freshly deployed core)
  console.log("6) Bootstrap owner");
  const seedUrl = `${core.url.replace(/\/$/, "")}/api/provision/seed-owner`;
  const payload = JSON.stringify({ email: cfg.owner.email, password: ownerPassword, name: cfg.owner.name ?? "Owner" });
  if (DRY) {
    console.log(`  » would POST ${seedUrl}  (Bearer PROVISION_TOKEN)`);
  } else {
    const res = await fetch(seedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secrets.PROVISION_TOKEN}`, Origin: core.url },
      body: payload,
    });
    if (!res.ok && res.status !== 409) die(`Owner seed failed (${res.status}): ${await res.text()}`);
    console.log(`  ✓ owner ${cfg.owner.email} ${res.status === 409 ? "already existed" : "created"}`);
  }

  // 7. Revoke the one-time token
  console.log("7) Revoke provisioning token");
  wrangler(CORE_DIR, ["secret", "delete", "PROVISION_TOKEN", "-c", coreCfgName], { label: `wrangler secret delete PROVISION_TOKEN -c ${coreCfgName}` });

  // Done
  console.log(`\n${"═".repeat(48)}`);
  console.log(DRY ? "DRY RUN complete — nothing was deployed." : "✓ Provisioned.");
  console.log(`  Storefront   ${store.url}`);
  console.log(`  Admin/API    ${core.url}`);
  console.log(`  Owner login  ${cfg.owner.email}`);
  if (!DRY) console.log(`  Temp password ${ownerPassword}   ← share securely; owner should change it`);
  console.log(`${"═".repeat(48)}\n`);
}

// ---- Dispatch ----------------------------------------------------------
if (command === "plan") {
  printPlan();
} else if (command === "configure") {
  const databaseId = core.databaseId || readState().databaseId || "";
  writeConfigs(databaseId);
  if (!databaseId) console.log('  ! database_id unknown yet — run `up` (or set core.databaseId) before deploying.');
} else if (command === "up") {
  await up();
}
