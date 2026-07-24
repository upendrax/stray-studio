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

// --- Cart validation (/api/store/cart/validate) --------------------------

export type CartLine = {
  variantId: string;
  productId?: string;
  slug?: string;
  title?: string;
  variantLabel?: string | null;
  image?: string | null; // r2Key
  unitPrice?: number;
  quantity: number; // effective (after any stock cap)
  requestedQuantity: number;
  lineTotal?: number;
  maxQuantity?: number | null;
  adjusted?: boolean;
  removed?: boolean;
  reason?: string;
};

export type CartDiscount =
  | { valid: false; code: string; reason: string; amount: 0 }
  | { valid: true; code: string; type: "percent" | "fixed" | "free_shipping"; value: number; amount: number; freeShipping: boolean };

export type CartValidation = {
  items: CartLine[];
  subtotal: number;
  discount: CartDiscount | null;
  discountAmount: number;
  shipping: number;
  shipRate: number;
  freeShippingThreshold: number | null;
  total: number;
  itemCount: number;
  currency: string;
};

// --- Account (/api/store/account/*) --------------------------------------

export type AccountOrder = {
  number: number;
  status: OrderConfirmation["status"];
  paymentStatus: OrderConfirmation["paymentStatus"];
  total: number;
  itemCount: number;
  image: string | null;
  createdAt: number;
};

export type Address = {
  id: string;
  userId: string;
  label: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: number;
};

// --- Order confirmation (/api/store/orders/:number) ----------------------

export type OrderConfirmation = {
  number: number;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
  email: string;
  phone: string;
  shipName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipPostalCode: string | null;
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  shippingAmount: number;
  total: number;
  paymentMethod: "payhere" | "bank";
  paymentStatus: "pending" | "paid" | "rejected" | "refunded";
  slipUploaded: boolean;
  createdAt: number;
  items: { title: string; variantTitle: string | null; image: string | null; unitPrice: number; quantity: number }[];
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
