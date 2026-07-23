// Brand defaults that don't live in store settings. A client project overrides
// this file (or swaps the CSS theme variables) to rebrand the kit.
export const SITE = {
  // Fallback name shown before settings load / if the owner hasn't set one.
  fallbackName: "Stray Studio",
  // Hero copy for the home page.
  hero: {
    eyebrow: "Made in Sri Lanka",
    heading: "Everyday cotton, considered.",
    sub: "Heavyweight tees, linen shirts and honest basics — cut for the climate, built to outlast the trend.",
  },
  footerNote: "Cut, sewn and shipped from Colombo.",
};

export type SiteConfig = typeof SITE;
