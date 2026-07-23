// Mirror of the core /api/store/* response shapes. Money is integer cents.

export type Swatch = {
  value: string;
  color: string | null;
  image: string | null;
};

// Grid card (home, catalog, collection).
export type ProductCard = {
  id: string;
  title: string;
  slug: string;
  priceMin: number;
  priceMax: number;
  compareAtPrice: number | null;
  image: string | null;
  inStock: boolean;
  hasOptions: boolean;
  swatches: Swatch[];
};

export type OptionValue = {
  id: string; // global attributeValueId — variants reference these
  value: string;
  color: string | null;
  images: string[];
};

export type ProductOption = {
  attributeId: string;
  name: string;
  useImages: boolean;
  useColor: boolean;
  values: OptionValue[];
};

export type ProductVariant = {
  id: string;
  sku: string | null;
  price: number; // effective cents
  quantity: number;
  available: boolean;
  inStock: boolean;
  optionValueIds: string[]; // attributeValueIds identifying the combination
};

export type ProductDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  priceMin: number;
  priceMax: number;
  inStock: boolean;
  hasOptions: boolean;
  trackInventory: boolean;
  images: { r2Key: string; alt: string | null }[];
  categories: { id: string; name: string; slug: string }[];
  options: ProductOption[];
  variants: ProductVariant[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  coverImageKey: string | null;
  sortOrder: number;
  productCount: number;
};

export type StoreSettings = {
  storeName: string;
  email: string;
  phone: string;
  address: string;
  shipRate: string;
  shipFree: string;
  payhere: { enabled: boolean; merchantId: string; sandbox: boolean };
  bank: { enabled: boolean; details: string };
  currency: string;
};
