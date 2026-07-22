// Seed data ported from the approved design prototype (design-reference/).
// Replaced by the real Studio API once core routes land.

export type OrderStatus =
  | "Pending"
  | "Paid"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Refunded";

export type PaymentMethod = "payhere" | "bank";
export type StockLevel = "ok" | "low" | "out";

export interface ProductOption {
  name: string;
  values: string[];
  useImages: boolean;
}

export interface Variant {
  key: string; // "Red / M"
  price: number;
  sku: string;
  qty: number;
  available: boolean;
}

export interface Product {
  id: string;
  name: string;
  status: "Active" | "Draft";
  type: "variable" | "simple";
  // variable
  basePrice?: number;
  options?: ProductOption[];
  variants?: Variant[];
  // simple
  price?: number;
  compareAt?: number | "";
  chargeTax?: boolean;
  costPerItem?: number | "";
  sku?: string;
  trackInv?: boolean;
  qty?: number;
  lowAt?: number;
  updatedMin: number;
  cats: string[];
  tags: string[];
}

export interface OrderLine {
  name: string;
  variant: string;
  sku: string;
  qty: number;
  price: number;
}

export interface OrderEvent {
  min: number;
  title: string;
  actor: string;
  note?: boolean; // internal admin note — rendered italic, never customer-visible
}

export interface Order {
  num: number;
  min: number; // minutes ago
  cust: string;
  guest: boolean;
  email: string;
  phone: string;
  pay: PaymentMethod;
  status: OrderStatus;
  lines: OrderLine[];
  ship: number;
  disc: { code: string; amount: number } | null;
  subtotal: number;
  total: number;
  address: string;
  events: OrderEvent[];
  orderCount: string;
  tracking: { courier: string; number: string } | null;
  note?: string; // owner's private note about this order
  payRef?: string;
  slip?: boolean;
  slipMin?: number;
}

export function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>(
    (acc, l) => acc.flatMap((a) => l.map((v) => a.concat([v]))),
    [[]],
  );
}

function mkVariants(opts: ProductOption[], qtys: number[], base: number): Variant[] {
  return cartesian(opts.map((o) => o.values)).map((c, i) => ({
    key: c.join(" / "),
    price: base,
    sku: "",
    qty: qtys[i] ?? 24,
    available: true,
  }));
}

const p1opts: ProductOption[] = [
  { name: "Color", values: ["Black", "White", "Red"], useImages: true },
  { name: "Size", values: ["S", "M", "L", "XL"], useImages: false },
];
const p2opts: ProductOption[] = [
  { name: "Color", values: ["Black", "White"], useImages: false },
  { name: "Size", values: ["S", "M", "L"], useImages: false },
];
const p3opts: ProductOption[] = [
  { name: "Color", values: ["Ecru", "Charcoal"], useImages: true },
  { name: "Size", values: ["M", "L", "XL"], useImages: false },
];

export const seedProducts: Product[] = [
  { id: "p1", name: "Oversized Tee", status: "Active", type: "variable", basePrice: 2800, options: p1opts, variants: mkVariants(p1opts, [42, 38, 27, 12, 30, 25, 18, 0, 22, 2, 14, 8], 2800), updatedMin: 120, cats: ["Tops > T-Shirts > Oversized"], tags: ["bestseller"] },
  { id: "p2", name: "Classic Crew Tee", status: "Active", type: "variable", basePrice: 2200, options: p2opts, variants: mkVariants(p2opts, [55, 61, 44, 39, 50, 47], 2200), updatedMin: 400, cats: ["Tops > T-Shirts"], tags: [] },
  { id: "p3", name: "Boxy Heavyweight Tee", status: "Active", type: "variable", basePrice: 3200, options: p3opts, variants: mkVariants(p3opts, [4, 3, 0, 5, 2, 1], 3200), updatedMin: 2000, cats: ["Tops > T-Shirts"], tags: ["new"] },
  { id: "p4", name: "Linen Camp Shirt", status: "Active", type: "simple", price: 4800, compareAt: 5600, sku: "LCS-01", trackInv: true, qty: 18, lowAt: 5, updatedMin: 3100, cats: ["Tops > Shirts"], tags: [] },
  { id: "p5", name: "Ribbed Tank", status: "Active", type: "simple", price: 1900, compareAt: "", sku: "RT-02", trackInv: true, qty: 0, lowAt: 5, updatedMin: 5200, cats: ["Tops"], tags: [] },
  { id: "p6", name: "Dad Cap", status: "Active", type: "simple", price: 1500, compareAt: "", sku: "DC-05", trackInv: true, qty: 42, lowAt: 5, updatedMin: 7800, cats: ["Accessories"], tags: [] },
  { id: "p7", name: "Canvas Tote", status: "Draft", type: "simple", price: 1900, compareAt: "", sku: "", trackInv: true, qty: 60, lowAt: 5, updatedMin: 9900, cats: ["Accessories"], tags: ["new"] },
];

const ADDRESS = "No. 24, Flower Road\nColombo 07\nWestern Province, 00700";

function mkOrder(
  num: number,
  min: number,
  cust: string,
  guest: boolean,
  email: string,
  phone: string,
  pay: PaymentMethod,
  status: OrderStatus,
  lines: OrderLine[],
  ship: number,
  disc: { code: string; amount: number } | null,
  extra: Partial<Order> = {},
): Order {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal - (disc ? disc.amount : 0) + ship;
  const events: OrderEvent[] = [];
  if (status === "Delivered")
    events.push({ min: min - 4000 < 0 ? 30 : min - 4300, title: "Delivered", actor: "by Rashmi (owner)" });
  if (status === "Delivered" || status === "Shipped")
    events.push({ min: Math.max(20, min - 2000), title: "Marked as shipped", actor: "by Rashmi (owner)" });
  if (pay === "payhere" && status !== "Pending" && status !== "Cancelled")
    events.push({ min: min - 1, title: "Payment received via PayHere", actor: "automatic" });
  if (status === "Cancelled")
    events.push({ min: min - 300 > 0 ? min - 300 : 10, title: "Order cancelled — items restocked", actor: "by Rashmi (owner)" });
  if (status === "Refunded")
    events.push({ min: min - 5000 > 0 ? min - 5000 : 10, title: "Refund recorded", actor: "by Rashmi (owner)" });
  if (extra.slip)
    events.push({ min: extra.slipMin ?? min, title: "Bank slip uploaded", actor: "by customer" });
  events.push({ min, title: "Order placed", actor: "by customer" });
  return {
    num, min, cust, guest, email, phone, pay, status, lines, ship, disc,
    subtotal, total,
    address: `${cust}\n${ADDRESS}`,
    events,
    orderCount: guest ? "First order" : "3rd order",
    tracking: null,
    ...extra,
  };
}

export const seedOrders: Order[] = [
  mkOrder(1046, 22, "Nethmi Perera", false, "nethmi.p@gmail.com", "+94 77 123 4567", "payhere", "Paid", [{ name: "Oversized Tee", variant: "Red / M", sku: "OT-RD-M", qty: 1, price: 2800 }, { name: "Dad Cap", variant: "", sku: "DC-05", qty: 1, price: 1500 }], 400, null, { payRef: "PH-320481022" }),
  mkOrder(1045, 64, "Kasun Silva", true, "kasun.silva@yahoo.com", "+94 71 555 0192", "payhere", "Pending", [{ name: "Classic Crew Tee", variant: "White / L", sku: "CC-WH-L", qty: 2, price: 2200 }], 400, null, { orderCount: "First order" }),
  mkOrder(1044, 180, "Dilini Fernando", false, "dilini.f@outlook.com", "+94 76 220 8834", "payhere", "Paid", [{ name: "Boxy Heavyweight Tee", variant: "Ecru / L", sku: "BH-EC-L", qty: 1, price: 3200 }, { name: "Oversized Tee", variant: "Black / L", sku: "OT-BK-L", qty: 1, price: 2800 }, { name: "Ribbed Tank", variant: "", sku: "RT-02", qty: 1, price: 1900 }], 0, null, { payRef: "PH-320480311" }),
  mkOrder(1043, 360, "Amaya Jayasuriya", false, "amaya.jay@gmail.com", "+94 70 889 4412", "payhere", "Shipped", [{ name: "Linen Camp Shirt", variant: "", sku: "LCS-01", qty: 1, price: 4800 }, { name: "Dad Cap", variant: "", sku: "DC-05", qty: 1, price: 1500 }], 0, null, { payRef: "PH-320478190", tracking: { courier: "Koombiyo", number: "LK4429810" } }),
  mkOrder(1042, 1560, "Ruwan Wickramasinghe", false, "ruwan.w@gmail.com", "+94 77 640 2277", "bank", "Pending", [{ name: "Linen Camp Shirt", variant: "", sku: "LCS-01", qty: 1, price: 4800 }], 400, { code: "WELCOME10", amount: 480 }, { slip: true, slipMin: 1380 }),
  mkOrder(1041, 1740, "Shenali Gunawardena", false, "shenali.g@gmail.com", "+94 75 301 9945", "payhere", "Shipped", [{ name: "Oversized Tee", variant: "Black / M", sku: "OT-BK-M", qty: 1, price: 2800 }, { name: "Classic Crew Tee", variant: "Black / S", sku: "CC-BK-S", qty: 1, price: 2200 }], 400, null, { payRef: "PH-320475622", tracking: { courier: "Pronto", number: "PR-118842" } }),
  mkOrder(1040, 2980, "Tharindu Bandara", false, "tharindu.b@gmail.com", "+94 71 776 5023", "payhere", "Delivered", [{ name: "Ribbed Tank", variant: "", sku: "RT-02", qty: 1, price: 1900 }, { name: "Dad Cap", variant: "", sku: "DC-05", qty: 1, price: 1500 }], 400, null, { payRef: "PH-320471055" }),
  mkOrder(1039, 4400, "Ishara Madushani", false, "ishara.m@gmail.com", "+94 76 402 1188", "payhere", "Delivered", [{ name: "Oversized Tee", variant: "White / S", sku: "OT-WH-S", qty: 2, price: 2800 }, { name: "Boxy Heavyweight Tee", variant: "Charcoal / M", sku: "BH-CH-M", qty: 1, price: 3200 }], 0, null, { payRef: "PH-320465921" }),
  mkOrder(1038, 5900, "Sachini Rathnayake", true, "sachini.r@gmail.com", "+94 70 233 7789", "payhere", "Cancelled", [{ name: "Classic Crew Tee", variant: "White / M", sku: "CC-WH-M", qty: 1, price: 2200 }], 400, null, { orderCount: "First order" }),
  mkOrder(1037, 13100, "Nadeesha Herath", false, "nadeesha.h@gmail.com", "+94 77 918 3345", "bank", "Refunded", [{ name: "Linen Camp Shirt", variant: "", sku: "LCS-01", qty: 1, price: 4800 }, { name: "Dad Cap", variant: "", sku: "DC-05", qty: 1, price: 1500 }], 0, null, {}),
  mkOrder(1036, 17400, "Chamodi Alwis", false, "chamodi.a@gmail.com", "+94 71 450 6671", "payhere", "Delivered", [{ name: "Oversized Tee", variant: "Red / L", sku: "OT-RD-L", qty: 1, price: 2800 }, { name: "Classic Crew Tee", variant: "Black / M", sku: "CC-BK-M", qty: 1, price: 2200 }], 400, null, { payRef: "PH-320441002" }),
];

// ---------------------------------------------------------------------------
// Attributes — global option definitions. Products pick from these; the only
// per-product parts are WHICH values apply and the per-value image sets.
// ---------------------------------------------------------------------------

export interface AttributeValue {
  value: string;
  color?: string; // hex swatch, only when the attribute has useColor
}

export interface AttributeDef {
  id: string;
  name: string;
  values: AttributeValue[];
  useImages: boolean; // values carry image sets (e.g. Color)
  useColor: boolean; // values carry a hex swatch (picker or typed hex)
}

export const seedAttributes: AttributeDef[] = [
  {
    id: "a1",
    name: "Size",
    values: [{ value: "S" }, { value: "M" }, { value: "L" }, { value: "XL" }],
    useImages: false,
    useColor: false,
  },
  {
    id: "a2",
    name: "Color",
    values: [
      { value: "Black", color: "#1a1a1a" },
      { value: "White", color: "#f5f5f4" },
      { value: "Red", color: "#dc2626" },
      { value: "Ecru", color: "#f0ead6" },
      { value: "Charcoal", color: "#36454f" },
    ],
    useImages: true,
    useColor: true,
  },
  {
    id: "a3",
    name: "Flavor",
    values: [{ value: "Vanilla" }, { value: "Chocolate" }],
    useImages: false,
    useColor: false,
  },
];

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export type DiscountType = "pct" | "amt" | "ship";
export type DiscountStatus = "Active" | "Scheduled" | "Expired" | "Disabled";
export type DiscountApplies = "order" | "categories" | "products";
export type DiscountMinType = "none" | "amount" | "quantity";

export interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  pct: string;
  amt: string;
  // What the discount applies to (ship type is always order-level)
  applies: DiscountApplies;
  appliesCategories: string[]; // category paths
  appliesProducts: string[]; // product ids
  // Minimum purchase requirement
  minType: DiscountMinType;
  min: string; // amount (Rs) when minType === "amount"
  minQty: string; // item count when minType === "quantity"
  // Usage
  limit: string; // max total uses ("" = unlimited)
  uses: number;
  onePer: boolean;
  // Schedule
  start: string; // ISO date
  end: string; // ISO date or ""
  enabled: boolean;
}

export function makeDiscount(patch: Partial<Discount> = {}): Discount {
  return {
    id: "",
    code: "",
    type: "pct",
    pct: "10",
    amt: "",
    applies: "order",
    appliesCategories: [],
    appliesProducts: [],
    minType: "none",
    min: "",
    minQty: "",
    limit: "",
    uses: 0,
    onePer: false,
    start: new Date().toISOString().slice(0, 10),
    end: "",
    enabled: true,
    ...patch,
  };
}

export const seedDiscounts: Discount[] = [
  makeDiscount({ id: "d1", code: "WELCOME10", type: "pct", pct: "10", onePer: true, uses: 34, start: "2026-05-01" }),
  makeDiscount({ id: "d2", code: "FREESHIP5K", type: "ship", pct: "", minType: "amount", min: "5000", uses: 12, start: "2026-06-10" }),
  makeDiscount({ id: "d3", code: "AVURUDU25", type: "pct", pct: "25", applies: "categories", appliesCategories: ["Tops"], limit: "100", uses: 88, start: "2026-04-05", end: "2026-04-20" }),
  makeDiscount({ id: "d4", code: "VIP500", type: "amt", pct: "", amt: "500", limit: "50", uses: 6, onePer: true, start: "2026-03-01", enabled: false }),
];

export function discountStatus(d: Discount): DiscountStatus {
  if (!d.enabled) return "Disabled";
  const now = Date.now();
  if (d.end && new Date(`${d.end}T23:59:59`).getTime() < now) return "Expired";
  if (new Date(`${d.start}T00:00:00`).getTime() > now) return "Scheduled";
  return "Active";
}

export function discountTypeLabel(d: Discount): string {
  if (d.type === "pct") return `${d.pct}% off`;
  if (d.type === "amt") return `Rs. ${Number(d.amt).toLocaleString("en-US")} off`;
  return "Free shipping";
}

// ---------------------------------------------------------------------------
// Categories — identity/hierarchy is the full path ("Tops > T-Shirts"), max 3
// deep. Products are assigned by hand (from the product editor or bulk action).
// ---------------------------------------------------------------------------

export interface Category {
  path: string; // "Tops > T-Shirts" — identity + hierarchy
  description: string; // shown on the storefront category page
  hasCover: boolean; // mock: whether a banner image was set
  slug: string; // storefront URL, defaults from path, editable
  metaTitle: string;
  metaDesc: string;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pathSlug(path: string): string {
  return path.split(" > ").map(slugify).join("/");
}

export function makeCategory(path: string, patch: Partial<Category> = {}): Category {
  return {
    path,
    description: "",
    hasCover: false,
    slug: pathSlug(path),
    metaTitle: "",
    metaDesc: "",
    ...patch,
  };
}

export const seedCategories: Category[] = [
  makeCategory("Tops"),
  makeCategory("Tops > T-Shirts"),
  makeCategory("Tops > T-Shirts > Oversized"),
  makeCategory("Tops > Shirts"),
  makeCategory("Accessories"),
];

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export interface StoreSettings {
  storeName: string;
  email: string;
  phone: string;
  address: string;
  shipRate: string;
  shipFree: string;
  phOn: boolean;
  phId: string;
  phSecret: string;
  phSandbox: boolean;
  bankOn: boolean;
  bankDetails: string;
  emApproved: boolean;
  emRejected: boolean;
  emShipped: boolean;
  emDelivered: boolean;
}

export const seedSettings: StoreSettings = {
  storeName: "Salt & Cotton",
  email: "hello@saltandcotton.lk",
  phone: "+94 11 234 5678",
  address: "No. 48, Galle Road\nColombo 03",
  shipRate: "400",
  shipFree: "5000",
  phOn: true,
  phId: "1224753",
  phSecret: "8kJ2mN4pQ6rS8tU0",
  phSandbox: true,
  bankOn: true,
  bankDetails: "Commercial Bank — Kollupitiya\nSalt & Cotton (Pvt) Ltd\nA/C 8001234567",
  emApproved: true,
  emRejected: true,
  emShipped: true,
  emDelivered: true,
};

// ---------------------------------------------------------------------------
// Customers — derived from orders
// ---------------------------------------------------------------------------

export interface Customer {
  name: string;
  email: string;
  phone: string;
  guest: boolean;
  count: number;
  countSpend: number;
  spent: number;
  address: string;
  joinedMin: number;
}

// Registered customers joined before their first order; guests "join" at it.
const JOIN_MAP: Record<string, number> = {
  "Nethmi Perera": 191000, "Dilini Fernando": 246000, "Amaya Jayasuriya": 133000,
  "Ruwan Wickramasinghe": 92000, "Shenali Gunawardena": 262000, "Tharindu Bandara": 312000,
  "Ishara Madushani": 154000, "Nadeesha Herath": 411000, "Chamodi Alwis": 61000,
};

export function deriveCustomers(orders: Order[]): Customer[] {
  const map: Record<string, Customer> = {};
  for (const o of orders) {
    const c = (map[o.cust] ??= {
      name: o.cust, email: o.email, phone: o.phone, guest: o.guest,
      count: 0, countSpend: 0, spent: 0, address: o.address, joinedMin: o.min,
    });
    c.count++;
    if (o.status !== "Cancelled" && o.status !== "Refunded") {
      c.spent += o.total;
      c.countSpend++;
    }
    c.joinedMin = Math.max(c.joinedMin, o.min);
  }
  return Object.values(map)
    .map((c) => ({ ...c, joinedMin: c.guest ? c.joinedMin : (JOIN_MAP[c.name] ?? c.joinedMin) }))
    .sort((a, b) => b.spent - a.spent);
}

export function stockLevel(p: Product): StockLevel {
  if (p.type === "simple") {
    if (!p.trackInv) return "ok";
    if ((p.qty ?? 0) <= 0) return "out";
    if ((p.qty ?? 0) <= (p.lowAt ?? 5)) return "low";
    return "ok";
  }
  const qs = (p.variants ?? []).map((v) => v.qty);
  if (qs.every((q) => q <= 0)) return "out";
  if (qs.some((q) => q <= 5)) return "low";
  return "ok";
}

export interface LowItem {
  product: Product;
  label: string;
  qty: number;
}

export function lowStockItems(products: Product[]): LowItem[] {
  const out: LowItem[] = [];
  for (const p of products) {
    if (p.type === "simple") {
      if (p.trackInv && (p.qty ?? 0) <= (p.lowAt ?? 5))
        out.push({ product: p, label: p.name, qty: p.qty ?? 0 });
    } else {
      for (const v of p.variants ?? [])
        if (v.qty <= 5) out.push({ product: p, label: `${p.name} — ${v.key}`, qty: v.qty });
    }
  }
  return out;
}

/** Plausible revenue series for the dashboard chart (same shape as the design). */
export function chartSeries(days: number): number[] {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = 90 - i;
    out.push(
      Math.max(
        1200,
        Math.round(
          13000 + 5200 * Math.sin(t / 6.5) + 3800 * Math.sin(t / 2.13) + ((t * 997) % 4200) + t * 55,
        ),
      ),
    );
  }
  return out;
}
