import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// Conventions:
// - IDs are text (nanoid, generated app-side).
// - Money is integer cents (LKR). Format at the edge, never store floats.
// - Timestamps are integer unix ms.

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now());
const updatedAt = () =>
  integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now());

// Better Auth hands the drizzle adapter JS `Date` objects for its date columns.
// timestamp_ms mode makes drizzle serialize them to integer unix-ms (same
// on-disk INTEGER type as the rest of the schema — no DDL/migration change).
const authTs = (name: string) => integer(name, { mode: "timestamp_ms" });
const authCreatedAt = () => authTs("created_at").notNull().$defaultFn(() => new Date());
const authUpdatedAt = () => authTs("updated_at").notNull().$defaultFn(() => new Date());

// ---------------------------------------------------------------------------
// Auth (Better Auth managed tables + role extension)
// Roles: "owner" | "staff" | "customer"
// Admins (owner/staff) sign in with email+password; customers use email OTP.
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  role: text("role", { enum: ["owner", "staff", "customer"] })
    .notNull()
    .default("customer"),
  phone: text("phone"),
  createdAt: authCreatedAt(),
  updatedAt: authUpdatedAt(),
});

export const session = sqliteTable("session", {
  id: id(),
  expiresAt: authTs("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: authCreatedAt(),
  updatedAt: authUpdatedAt(),
});

export const account = sqliteTable("account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: authTs("access_token_expires_at"),
  refreshTokenExpiresAt: authTs("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: authCreatedAt(),
  updatedAt: authUpdatedAt(),
});

export const verification = sqliteTable("verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: authTs("expires_at").notNull(),
  createdAt: authCreatedAt(),
  updatedAt: authUpdatedAt(),
});

export const staffInvite = sqliteTable("staff_invite", {
  id: id(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role", { enum: ["staff"] }).notNull().default("staff"),
  expiresAt: authTs("expires_at").notNull(),
  acceptedAt: authTs("accepted_at"),
  createdAt: authCreatedAt(),
});

// ---------------------------------------------------------------------------
// Store settings — single-table key/value, values are JSON strings.
// Keys: store (name/logo/contact), shipping (flatRate/freeAbove),
// payments.payhere, payments.cod, payments.bank, emails.
// ---------------------------------------------------------------------------

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    coverImageKey: text("cover_image_key"),
    // Max depth 3 (parent > child > grandchild) is enforced in the API, not here.
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    // SEO
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

export const products = sqliteTable(
  "products",
  {
    id: id(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"), // rich text as HTML (sanitized server-side)
    status: text("status", { enum: ["active", "draft"] })
      .notNull()
      .default("draft"),
    // Every product has >=1 variant; hasOptions=false means the single
    // auto-created default variant (simple product).
    hasOptions: integer("has_options", { mode: "boolean" })
      .notNull()
      .default(false),
    basePrice: integer("base_price").notNull().default(0), // cents
    compareAtPrice: integer("compare_at_price"), // cents, shown struck-through
    chargeTax: integer("charge_tax", { mode: "boolean" }).notNull().default(false),
    costPerItem: integer("cost_per_item"), // cents; internal, never shown to customers
    trackInventory: integer("track_inventory", { mode: "boolean" })
      .notNull()
      .default(true),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_status_idx").on(t.status),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

// Global attributes — the option vocabulary of the store (Size, Color…).
// Products only pick from these, which keeps storefront filters consistent.
export const attributes = sqliteTable(
  "attributes",
  {
    id: id(),
    name: text("name").notNull(),
    // When true (typically Color), each value carries a per-product image set.
    useImages: integer("use_images", { mode: "boolean" })
      .notNull()
      .default(false),
    // When true, each value carries a hex swatch (storefront color selector).
    useColor: integer("use_color", { mode: "boolean" })
      .notNull()
      .default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("attributes_name_idx").on(t.name)],
);

export const attributeValues = sqliteTable(
  "attribute_values",
  {
    id: id(),
    attributeId: text("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    color: text("color"), // hex swatch, only when the attribute has useColor
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("attribute_values_unique_idx").on(t.attributeId, t.value),
    index("attribute_values_attribute_idx").on(t.attributeId),
  ],
);

// A product option = "this product uses attribute X" (deleting an attribute
// that products still use is blocked by the restrict FK).
export const productOptions = sqliteTable(
  "product_options",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    attributeId: text("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_options_product_idx").on(t.productId)],
);

// Which of the attribute's values this product actually offers.
export const productOptionValues = sqliteTable(
  "product_option_values",
  {
    id: id(),
    optionId: text("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    attributeValueId: text("attribute_value_id")
      .notNull()
      .references(() => attributeValues.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("option_values_option_idx").on(t.optionId)],
);

export const optionValueImages = sqliteTable(
  "option_value_images",
  {
    id: id(),
    optionValueId: text("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("option_value_images_value_idx").on(t.optionValueId)],
);

export const variants = sqliteTable(
  "variants",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku"),
    price: integer("price"), // cents; null = inherit product basePrice
    quantity: integer("quantity").notNull().default(0),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    // Archived when its option combination is removed (stock history kept).
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

export const variantOptionValues = sqliteTable(
  "variant_option_values",
  {
    variantId: text("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    optionValueId: text("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })],
);

export const productCategories = sqliteTable(
  "product_categories",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })],
);

export const productTags = sqliteTable(
  "product_tags",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.tag] })],
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const addresses = sqliteTable(
  "addresses",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label"), // "Home", "Office"
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    postalCode: text("postal_code"),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Orders
// Status flow: pending -> paid -> shipped -> delivered
//              pending/paid -> cancelled (restocks)
//              paid/shipped/delivered -> refunded (owner only, record-keeping)
// ---------------------------------------------------------------------------

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    number: integer("number").notNull(), // sequential per store: #1001, #1002…
    status: text("status", {
      enum: ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"],
    })
      .notNull()
      .default("pending"),
    // Customer (nullable = guest checkout; contact fields always snapshotted)
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    // Shipping address snapshot (orders keep their data even if address edited)
    shipName: text("ship_name").notNull(),
    shipLine1: text("ship_line1").notNull(),
    shipLine2: text("ship_line2"),
    shipCity: text("ship_city").notNull(),
    shipPostalCode: text("ship_postal_code"),
    // Money (cents)
    subtotal: integer("subtotal").notNull(),
    discountAmount: integer("discount_amount").notNull().default(0),
    discountCode: text("discount_code"),
    shippingAmount: integer("shipping_amount").notNull().default(0),
    total: integer("total").notNull(),
    // Payment
    paymentMethod: text("payment_method", {
      enum: ["payhere", "bank"],
    }).notNull(),
    paymentStatus: text("payment_status", {
      enum: ["pending", "paid", "rejected", "refunded"],
    })
      .notNull()
      .default("pending"),
    payhereRef: text("payhere_ref"),
    slipR2Key: text("slip_r2_key"),
    slipUploadedAt: integer("slip_uploaded_at"),
    slipRejectReason: text("slip_reject_reason"),
    refundReference: text("refund_reference"),
    // Fulfillment
    courierName: text("courier_name"),
    trackingNumber: text("tracking_number"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.number),
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // References kept for linking, but title/sku/price are snapshots —
    // the order must stay intact even if the product is edited or deleted.
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: text("variant_id").references(() => variants.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    variantTitle: text("variant_title"), // "Red / M", null for simple products
    sku: text("sku"),
    imageR2Key: text("image_r2_key"),
    unitPrice: integer("unit_price").notNull(), // cents
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderEvents = sqliteTable(
  "order_events",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "placed",
        "payment_paid",
        "payment_rejected",
        "slip_uploaded",
        "status_changed",
        "note",
        "email_sent",
      ],
    }).notNull(),
    message: text("message").notNull(),
    actorType: text("actor_type", { enum: ["admin", "customer", "system"] })
      .notNull()
      .default("system"),
    actorId: text("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
);

// Sequential order numbers without racing: single-row counter, bumped in the
// same transaction that inserts the order.
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(), // "order_number"
  value: integer("value").notNull(),
});

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export const discounts = sqliteTable(
  "discounts",
  {
    id: id(),
    code: text("code").notNull(), // stored uppercase
    type: text("type", { enum: ["percent", "fixed", "free_shipping"] }).notNull(),
    value: integer("value").notNull().default(0), // percent 1-100, or cents
    // What it applies to (free_shipping is always order-level)
    applies: text("applies", { enum: ["order", "categories", "products"] })
      .notNull()
      .default("order"),
    // Minimum requirement
    minType: text("min_type", { enum: ["none", "amount", "quantity"] })
      .notNull()
      .default("none"),
    minOrderAmount: integer("min_order_amount"), // cents, when minType=amount
    minQuantity: integer("min_quantity"), // item count, when minType=quantity
    maxUses: integer("max_uses"), // null = unlimited
    usedCount: integer("used_count").notNull().default(0),
    oncePerCustomer: integer("once_per_customer", { mode: "boolean" })
      .notNull()
      .default(false),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at"), // null = no end date
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("discounts_code_idx").on(t.code)],
);

// Scope junctions for "applies to specific categories / products".
export const discountCategories = sqliteTable(
  "discount_categories",
  {
    discountId: text("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.discountId, t.categoryId] })],
);

export const discountProducts = sqliteTable(
  "discount_products",
  {
    discountId: text("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.discountId, t.productId] })],
);

export const discountRedemptions = sqliteTable(
  "discount_redemptions",
  {
    id: id(),
    discountId: text("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Email (not userId) so oncePerCustomer also covers guest checkouts.
    email: text("email").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("redemptions_discount_email_idx").on(t.discountId, t.email)],
);
