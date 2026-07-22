# Stray Studio — Admin UX Specification

**Version:** 1.0 (v1 scope, locked)
**Purpose:** Screen-by-screen specification for the Stray Studio admin panel. Feed this to the design tool — every screen, field, action, and state is defined here so nothing is guessed.

---

## 1. Product context

Stray Studio is the admin panel of a lightweight, reusable ecommerce CMS built for small/medium Sri Lankan brands (clothing, supplements, cosmetics). Each client gets their own isolated deployment. The person using this panel is the **store owner — not a technical user**. Every screen must be understandable by a small-business owner with zero training.

**V1 scope:** products (simple + variable), per-option-value images, inventory tracking, orders, discount codes, customer accounts, flat-rate shipping, payments (PayHere / bank slip), single owner admin (no staff roles), email + in-dashboard order notifications.

**Explicitly out of scope for v1:** multi-currency (LKR only), zone/weight shipping, abandoned carts, reviews, analytics beyond the dashboard, WhatsApp notifications, multi-store.

---

## 2. Design principles

1. **Compact density ("sm").** Modern SaaS dashboard feel (Linear / Vercel / Stripe). Base font 13–14px, control height 32px (h-8), tight spacing, 16px icons, compact table rows. Density is baked into the component defaults, never per-usage.
2. **Calm, not colorful.** Neutral surfaces; color is reserved for meaning (status, stock, destructive). One accent color (`--primary`, themeable per client).
3. **Zero-training UX.** Plain-language labels ("Out of stock" not "Inventory: 0"), inline helper text on anything non-obvious, no jargon (no "SKU" without helper text, no "fulfillment").
4. **Fast paths for daily work.** The two things the owner does all day — process orders and update stock — must each be ≤ 2 clicks from anywhere.
5. **Light + dark mode.** Both fully supported via semantic tokens from day one.

## 3. Design tokens (summary)

Two-tier system. Components use **semantic tokens only** — never raw values.

- **Primitives:** neutral scale (50–950), raw palettes, spacing scale, radius scale, type scale (xs 11 / sm 12 / base 13 / md 14 / lg 16 / xl 20 / 2xl 24).
- **Semantic (shadcn standard):** `background, foreground, card, card-foreground, popover, primary, primary-foreground, secondary, muted, muted-foreground, accent, border, input, ring, destructive`.
- **Semantic (ecommerce):**
  - Order status: `status-pending` (amber), `status-paid` (blue), `status-shipped` (violet), `status-delivered` (green), `status-cancelled` (neutral), `status-refunded` (rose). Each has a subtle badge style: tinted background + readable foreground, works in both modes.
  - Stock: `stock-ok` (green), `stock-low` (amber), `stock-out` (red).
  - Charts: `chart-1 … chart-5`.

---

## 4. Global layout

### App shell
- **Left sidebar** (260px — ChatGPT-style sizing: 36px items, rounded-lg, roomy padding; collapsible to 56px icon rail):
  - Top: store logo + store name (from settings).
  - Nav items (icon + label): Dashboard, Orders (with **badge showing count of new/pending orders**), Products (accordion group — expands to sub-items **All Products**, **Categories** and **Attributes** when the section is active), Discounts, Customers, Settings.
  - Bottom: theme toggle (light/dark), user menu (avatar, name, role label, "Profile", "Sign out").
- **Top bar** (within content area): slim bar for breadcrumbs on nested pages only ("Orders / Order detail"); empty on top-level pages (reserved for future global actions).
- **In-workspace page header:** every page opens with its title (16px semibold) + one-line muted description inside the content area, with the page's primary action on the right (Products → "Add product", Categories → "Add category", Discounts → "Create discount"…). Detail pages (order detail, customer detail, product editor) open with a **← back button** to their list page before the title (the editor's back opens the discard dialog first when there are unsaved changes).
- **Content area:** max-width ~1080px, centered with generous side space on wide screens, page padding 24px.
- Single admin user (the owner) — every nav item is always visible.

### Global patterns
- **Tables:** compact rows, sortable columns, sticky header, row click opens detail. **Checkbox column first** on Products, Orders, Discounts and Customers tables, with a select-all checkbox in the header; selecting rows reveals a contextual bulk-action bar (Products: Set Active/Draft/Delete · Orders: Mark as shipped/delivered — applies only to rows in the right status, others skipped with a toast · Discounts: Enable/Disable/Delete · Customers: Delete, anonymizing orders). Pagination: "Showing 1–25 of 214" + prev/next. Page size 25.
- **Search & filters:** search input (debounced) top-left of table; filter chips next to it; active filters removable; "Clear all" when ≥2 active.
- **Empty states:** icon + one-line explanation + primary action button. First-run empties are welcoming ("Add your first product"), filtered empties are factual ("No orders match these filters").
- **Loading:** skeleton rows for tables, skeleton blocks for detail pages. Never full-screen spinners.
- **Errors:** inline banner on the affected section with retry button. Form field errors inline under the field, red, specific.
- **Saving model:** detail/edit pages use explicit **Save bar** — a sticky bottom bar appears when there are unsaved changes ("Unsaved changes — [Discard] [Save]"). Navigating away with unsaved changes → confirm dialog.
- **Destructive actions:** always a confirm dialog naming the object ("Delete 'Oversized Tee'? This can't be undone."). Delete buttons use `destructive` token.
- **Toasts:** bottom-right, for success/error of async actions ("Product saved", "Order marked as shipped").
- **Money:** always "Rs. 4,500.00" format, tabular numerals in tables.
- **Dates:** relative for < 7 days ("2 hours ago"), absolute otherwise ("12 Jul 2026, 3:40 PM").

---

## 5. Screens

### 5.1 Auth

#### Login (`/login`)
- Centered card: store logo, "Sign in to {Store Name}".
- Fields: Email, Password (show/hide toggle). Button: "Sign in".
- Link: "Forgot password?"
- States: invalid credentials → inline error "Incorrect email or password."; rate-limited → "Too many attempts. Try again in X minutes."
- No self-registration. The owner account is created during store provisioning.

#### Forgot / reset password
- Email input → "We've sent a reset link if this email exists." (no account enumeration).
- Reset page: new password + confirm, strength hint, then redirect to login with success toast.

---

### 5.2 Dashboard (`/`)

Daily pulse for the owner. Answers: "How are we doing, and what needs my attention right now?"

**Layout (top → bottom):**
1. **Stat tiles row (4):** Today's revenue, Today's orders, Pending orders (needs action — click → Orders filtered to pending), Low stock items (click → Products filtered to low stock). Each tile: label, big number, small comparison ("vs yesterday +12%") — comparison muted, arrow up/down.
2. **Revenue chart:** line/area chart, last 30 days, toggle 7/30/90 days. Uses `chart-1`. Empty state (new store): friendly placeholder "Sales will appear here once orders come in."
3. **Two columns:**
   - **Recent orders** (last 8): order #, customer name, total, status badge, time. Row click → order detail. "View all" link.
   - **Needs attention list:** pending slip verifications ("Order #1042 — bank slip uploaded, needs review"), low/out-of-stock items ("Black Tee — Red/M — 2 left"). Each row is a deep link. Empty: "All caught up 🎉".

---

### 5.3 Products

#### Products list (`/products`)
- Top bar action: **"Add product"**.
- Table columns: thumbnail (40px), Name, Status (Active / Draft badge), Inventory summary ("128 in stock" / "Low stock" amber / "Out of stock" red — for variable products aggregate across variants: "12 variants · 340 in stock"), Price ("Rs. 2,500" or range "Rs. 2,500–3,200"), Updated.
- Search by name/SKU. Filters: Status, Stock level (In stock / Low / Out), Category (select with indented tree; picking a parent includes its descendants).
- Bulk actions (checkbox): Set Active, Set Draft, Delete.
- Row click → product editor.
- Empty (first run): "Add your first product" + button.

#### Product editor (`/products/new`, `/products/{id}`)
In-workspace header: **← back button** (to Products; opens the discard dialog first if there are unsaved changes) + page title ("New product", or the live product title when editing). Two-column layout below: main column (editing) + right rail (status & organization). Save bar pattern.

**Main column, in order:**

1. **Basics card:** Title (required), Description (simple rich text: bold, italic, lists, links — nothing more).
2. **Images card:** Product gallery — drag-drop upload zone, thumbnails reorderable by drag, first image = cover (marked "Cover"), delete on hover, alt text on click. Accepts jpg/png/webp, client-side resize before upload. Helper: "These photos show by default. You can add photos for each color below."
3. **Pricing card** (always visible): Price, Compare-at price, "Charge tax on this product" checkbox — when checked, a divider reveals a **Cost per item (Rs.)** field below (internal, helper: "Customers won't see this"). For variable products the **Price is the base for every variant**. Editing it updates every variant still at the old base; individually-overridden variants keep their price. There is **no separate "default price" field** — the Pricing card Price is the single base. **Inventory card** (simple products only): Track inventory switch → Quantity + Low stock alert, SKU. The Inventory card disappears when variants are on (stock/SKU live per-variant in the matrix); the Pricing card stays as the base price.
4. **Variants card:** — the heart of the editor.
   - Toggle at top: **"This product has options like size or color"** (off = simple product). When on, the card subtitle switches to "Prices, SKUs and stock are set per variant below."
   - **Options come from global Attributes only** (no free-text option names). "Add option" opens a picker of existing attributes (+ "New attribute…" which creates one inline, saved globally). Selecting an attribute shows ALL its values as toggleable chips, preselected — the owner clicks values off that don't apply to this product. Attributes whose values carry photos (e.g. Color) show a camera icon on each selected chip that opens that value's per-product photo panel.
   - **Simple mode (toggle off):** shows flat fields: Price (Rs.), Compare-at price (optional, helper: "Shown crossed out"), SKU (optional, helper: "Your internal product code"), "Track inventory" switch → Quantity field + "Low stock alert at" field (default 5).
   - **Variable mode (toggle on):**
     - **Options builder:** up to 3 options. Each: option name (text with suggestions: Size, Color, Flavor, Shade) + values as chips (type + Enter to add, drag to reorder, × to remove).
     - **Per-value images:** if an option is marked **"Use images for this option"** (checkbox, typically Color), each value chip gets an image slot — click value → small panel to upload/reorder that value's image set. Helper: "Customers will see these photos when they pick {value}."
     - **Variants table (auto-generated), grouped like Shopify:** the Pricing card's Price (above) is the base that pre-fills every variant — no separate default-price field. The table groups by the image-carrying option (Color), else the first option:
       - **Group header row** per group value: image thumbnail (assign), swatch + value name + "· N variants" expand chevron, price range (read-only, e.g. "Rs. 2,800–3,200"), total quantity. "Expand all / Collapse all" toggle above the table.
       - **Sub-rows** (when expanded): one per combination, indented, showing the remaining option label (e.g. "M"), a small image thumbnail (optional per-variant override), Price input, Quantity input, Available toggle, stock dot per `stock-*`.
       - **Single-option products** render flat (each value is a row with its own image thumbnail + price/qty/available), no grouping.
     - **Images (upload once, assign):** photos live in the product's Images card (central media library). Each group/variant image thumbnail opens a **"Select image"** dialog to pick from that library (or upload more) — you never re-upload per value. Assigning at the group (Color) level covers all its sizes; per-variant override is optional.
     - Edge case: changing options after creation shows warning "Changing options will regenerate variants. Stock for removed variants will be archived."

(No shipping/"physical product" card — all v1 products are physical goods.)

**Right rail:**
- **Status card:** Active / Draft select + helper ("Draft products aren't visible in your store").
- **Organization card:** Categories **checkbox picker** — a bordered box with a search field on top and a scrollable list of the store's real categories as checkboxes, indented by hierarchy (top level / child / grandchild); searching flattens to matches with full path shown. Products can only be assigned to categories that exist (no free text). Tags remain free-text chips.
- **Preview card:** "View in store ↗" (active products only).
- **Danger zone:** Delete product.

**States:** new product → empty form, Save disabled until Title present. Save success toast. Image upload failure → per-thumbnail retry.

#### Categories (`/products/categories` — sidebar sub-item under Products)
Hierarchical, up to **3 levels** (Parent > Child > Grandchild), e.g. Tops > T-Shirts > Oversized. Products are assigned by hand. (Rule-based "smart" categories were considered but dropped — too complex for the target user; any "New Arrivals"/"Sale" automation belongs in the storefront theme as a simple toggle, not an admin rules builder.)

- **Full-page editor** (`/products/categories/new`, `/products/categories/edit/:path`) like the product editor — back button + workspace layout + save bar, not a dialog. Main column: Details card (Name, Parent, Description) + Search engine card (URL handle, meta title, meta description). Right rail: Cover image card + Danger zone (delete, on edit).
- **Cover image + description (per category):** a banner image slot + short description shown at the top of the category's storefront page. Both optional.
- **SEO (per category):** URL handle (auto from path, editable) + meta title + meta description.
- **Bulk assign:** in the Products list, selecting rows → "Add to category" dropdown assigns them in one action.

- **Tree list view:** indented rows with expand/collapse chevrons. Each row: name, product count (own + descendants shown as "12 (+34)"), drag handle. Drag to reorder within the same level (controls storefront nav order); nesting is changed via the edit dialog, not drag (keeps drag interactions unambiguous).
- **Create/edit dialog:** Name, Parent category (select, "None (top level)" default — options show full path "Tops > T-Shirts"; selecting a grandchild as parent is disabled at max depth), optional description, optional cover image.
- **Delete:** confirm dialog; child categories are moved up one level (never deleted in cascade), products just lose that category.
- Products can belong to **multiple categories** (assigned from the product editor). A product in a child category is automatically included in its ancestors' storefront pages (a product in "Oversized" appears under "T-Shirts" and "Tops" too).
#### Attributes (`/products/attributes` — sidebar sub-item under Products)
Global option definitions (Size, Color, Flavor…). Because products can only select from these, storefront filters always group consistently — no free-text drift.

- **List:** rows with name, "photos" tag when values carry images, value chips, used-by product count, Edit/Delete. Delete is blocked with a toast while any product uses the attribute.
- **Full-page editor** (`/products/attributes/new`, `/products/attributes/edit/:id`) — back button + save bar + Danger zone, like the category/product editors. Details card (Name, unique) + Values card: values (chip input, type + Enter), "Values have colors" checkbox (each value gets a hex swatch — native color picker OR typed hex, kept in sync; in color mode values render as rows [swatch picker] [name] [hex input] [remove]), "Values carry photos" checkbox. Delete is blocked (and the button disabled) while any product uses the attribute.
- A lightweight **inline dialog** (`attribute-dialog.tsx`) still exists for the product editor's "Add option → New attribute…" quick-create, so you can add an attribute without leaving an unsaved product.

---

### 5.4 Orders

#### Orders list (`/orders`)
- Table columns: Order # ("#1042"), Date, Customer (name; "Guest" tag if no account), Items count, Total, Payment (method icon + label: PayHere / Bank transfer), Status badge.
- Search: order #, customer name, phone. Filters beside the search: **Status dropdown** (All statuses · Pending · Paid · Shipped · Delivered · Cancelled — with counts; Refunded orders appear under Cancelled) and payment method dropdown.
- Sidebar "Orders" badge = Pending count; clears as orders move out of Pending.
- Empty (first run): "Orders will appear here when customers start buying."

#### Order detail (`/orders/{id}`)
Header: "Order #1042" + status badge + date + **primary status-advance button** (see flow below) + overflow menu (Cancel order, Refund).

**Main column:**
1. **Items card:** each line: thumbnail, product + variant name ("Oversized Tee — Red / M"), SKU, qty × unit price, line total. Below: Subtotal, Discount (with code shown, e.g. "WELCOME10 −Rs. 450"), Shipping ("Rs. 400" or "Free"), **Total** (bold).
2. **Payment card:** method + state.
   - PayHere: "Paid via PayHere" + reference + paid-at time.
   - Bank transfer: uploaded slip image (click to zoom), upload time, buttons **"Approve payment"** / **"Reject"** (reject asks for a reason; customer gets an email with it). This is the flow surfaced on the Dashboard needs-attention list.
3. **Timeline card:** vertical event list: placed, payment events, status changes, notes — each with actor ("by Rashmi (owner)" / "by customer" / "automatic") and timestamp. **Add internal note** input at top (notes never visible to customer).

**Right rail:**
- **Customer card:** name, email, phone, link to customer detail (if account), order count ("3rd order").
- **Shipping address card:** full address, "Copy address" button (one click — for writing on parcels / courier forms).
- **Tracking card:** appears when moving to Shipped — optional fields: courier name, tracking number. Shown to customer in their account + shipped email.

**Status flow (the primary button always shows the next step):**
```
Pending ──(payment confirmed: auto for PayHere,
           manual approve for bank slip)──▶ Paid ──▶ Shipped ──▶ Delivered
   │
   └──▶ Cancelled (from Pending/Paid; restocks items after confirm dialog)
Refunded: from Paid/Shipped/Delivered; records refund
          reference manually (v1 = record-keeping, no gateway API refund).
```
- Marking **Shipped** opens a small dialog: courier + tracking # (both optional) → sends "Your order is on the way" email.
- Status changes are always allowed backwards one step via overflow menu ("Revert to Paid") — mistakes happen.

---

### 5.5 Discounts (`/discounts`)

#### List
- Table (consistent with other lists): checkbox + Code (monospace, copy on click), Type ("10% off" / "Rs. 500 off" / "Free shipping"), Usage ("34 / 100" or "34 / ∞"), Status (Active / Scheduled / Expired / Disabled badge), Ends. Search by code, bulk Enable/Disable/Delete, footer. Row click → editor.
- Action: "Create discount".

#### Create/edit — **full-page editor** (`/discounts/new`, `/discounts/edit/:id`), back button + save bar + summary rail. Cards:
- **Code:** code field + "Generate random code" (all discounts are code-based — customers type the code at checkout).
- **Discount value:** Type select (Percentage / Fixed amount / Free shipping) + value (% or Rs.). **Applies to** (not shown for Free shipping): Entire order / Specific categories / Specific products — with a searchable **checkbox picker** (category tree indented; product list) for the last two.
- **Minimum purchase requirements** (radio): None / Minimum amount (Rs.) / Minimum quantity of items.
- **Maximum discount uses:** "Limit total uses" (checkbox + number) + "Limit to one use per customer".
- **Active dates:** start date + "Set end date" (checkbox → end date).
- **Right rail — Summary:** live bullet summary (code, value, applies-to, minimum, usage, dates) + status badge; Danger zone (delete) on edit.
- Validation: unique code, % between 1–100, fixed amount required.
- **Deliberately skipped (too complex for the target user):** Automatic (no-code) discounts, Buy-X-Get-Y, customer segments / specific customers, discount combinations/stacking.
- DB: discounts table gained applies/minType/minQuantity; scope junctions `discount_categories`, `discount_products`.

---

### 5.6 Customers (`/customers`)

#### List
- Table: Name, Email, Phone, Orders count, Total spent, Joined. Search by name/email/phone.
- No "add customer" — accounts are created by customers via the storefront (guest checkout customers appear once they order, marked "Guest" until they register).

#### Customer detail (`/customers/{id}`)
- Header: name, contact info, joined date.
- Stat tiles: Orders, Total spent, Average order.
- Orders table (their orders, same columns as main list, click through).
- Addresses card (read-only list of their saved addresses).
- No editing of customer data by admin in v1 (privacy-safe default). Overflow: "Delete customer" (confirm dialog, anonymizes their orders).

---

### 5.7 Settings (`/settings`)

Vertical sub-nav within the page: General · Shipping · Payments · Emails.

#### General
- Store name, logo upload (used in Studio sidebar + customer emails), contact email, phone, business address, currency (locked to LKR, shown disabled with helper "Multi-currency is coming later").

#### Shipping
- Flat rate (Rs.) — "Delivery charge".
- Free shipping threshold (optional): "Free delivery for orders over Rs. ___" (empty = never).
- Helper preview sentence updates live: "Customers pay Rs. 400 delivery. Orders over Rs. 5,000 ship free."

#### Payments
Two toggle cards:
1. **PayHere** — switch + fields when on: Merchant ID, Merchant Secret (masked, reveal on click), mode toggle Sandbox/Live with warning color on Sandbox ("Test mode — real cards won't be charged").
2. **Bank transfer** — switch + bank details textarea (shown to customer at checkout: bank, account name, number, branch) + helper "Customers upload a payment slip; you approve it from the order page."
- Validation: at least one method must be enabled — disabling the last one is blocked with explanation.

#### Emails
- Read-only preview list of customer emails the store sends: Order confirmation, Payment approved/rejected, Order shipped, Order delivered, OTP sign-in code.
- Per-email toggle where optional (confirmation/OTP always on).
- Customization v1: logo + accent color only (pulled automatically from General + theme). Full template editing is out of scope.

#### Profile (from user menu, all roles)
- Name, email (read-only), change password (current + new + confirm).

---

## 6. Notifications recap

- **New order:** email to store contact email (subject "New order #1042 — Rs. 4,500") + sidebar Orders badge + Dashboard pending tile/list.
- **Slip uploaded:** appears in Dashboard needs-attention + on the order.
- **Low stock:** Dashboard needs-attention when quantity ≤ per-product threshold.
- No browser push, no WhatsApp in v1.

## 7. Component inventory (shadcn, sm defaults)

Button, Input, Textarea, Select, Combobox (categories/tags), Switch, Checkbox, RadioGroup, Dialog, Sheet (side panel), DropdownMenu, Tabs, Badge, Card, Toast (sonner), Tooltip, Skeleton, Table (TanStack), DatePicker (discount dates), Command palette (optional, post-v1), Avatar, Separator, chart components (Recharts area/line).

## 8. Screen list for design (checklist)

1. Login · 2. Forgot/reset password
3. Dashboard
6. Products list (+ empty state) · 7. Product editor — simple · 8. Product editor — variable (options builder + per-value images + variants matrix) · 9. Categories (tree view + create/edit dialog) · 9b. Attributes (list + create/edit dialog)
10. Orders list (+ tabs) · 11. Order detail (incl. slip approval variant)
12. Discounts list · 13. Discount create/edit
14. Customers list · 15. Customer detail
16. Settings: General · 17. Shipping · 18. Payments · 19. Emails
20. Profile · 21. Global: sidebar (expanded/collapsed), save bar, confirm dialog, toasts, empty/loading/error patterns, light + dark.
