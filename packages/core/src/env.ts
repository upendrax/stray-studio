export type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  APP_URL: string;
  // The client's storefront origin (Astro Worker). Trusted for credentialed
  // CORS so the storefront browser can call cart/checkout + customer OTP auth.
  STOREFRONT_URL?: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  PAYHERE_MERCHANT_SECRET: string;
  // One-time bootstrap token, set only while provisioning a new store. When
  // unset (normal operation) the /api/provision/* routes 404.
  PROVISION_TOKEN?: string;
};
