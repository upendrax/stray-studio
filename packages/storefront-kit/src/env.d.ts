/// <reference types="astro/client" />

// Runtime bindings/vars available on Cloudflare via Astro.locals.runtime.env.
type StoreEnv = {
  STORE_API_URL?: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<StoreEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface ImportMetaEnv {
  readonly STORE_API_URL?: string;
  readonly PUBLIC_STORE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
