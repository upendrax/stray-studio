import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  seedDiscounts,
  seedOrders,
  seedProducts,
  seedSettings,
  type AttributeDef,
  type AttributeValue,
  type Category,
  type Discount,
  type Order,
  type Product,
  type ProductSummary,
  type StoreSettings,
} from "@/lib/mock-data";
import { api } from "@/lib/api";
import { useAuth } from "@/state/auth-context";

// Transitional store. Settings + attributes are wired to the real API (#3b);
// the rest (orders/products/discounts/categories) stay mock until their pages
// are migrated. Seed values act as the pre-load fallback where one exists.

// Attributes as the API returns them: values carry ids (needed for reconcile)
// and colors are null (not undefined), plus a server-computed productCount.
interface ApiAttributeValue {
  id: string;
  value: string;
  color: string | null;
}
interface ApiAttribute {
  id: string;
  name: string;
  useImages: boolean;
  useColor: boolean;
  productCount?: number;
  values: ApiAttributeValue[];
}

function mapAttribute(a: ApiAttribute): AttributeDef {
  return {
    id: a.id,
    name: a.name,
    useImages: a.useImages,
    useColor: a.useColor,
    productCount: a.productCount ?? 0,
    values: a.values.map<AttributeValue>((v) => ({
      id: v.id,
      value: v.value,
      color: v.color ?? undefined,
    })),
  };
}

function attributeBody(rec: AttributeDef) {
  return {
    name: rec.name,
    useImages: rec.useImages,
    useColor: rec.useColor,
    values: rec.values.map((v) => ({
      id: v.id, // omitted (undefined) for new values -> server inserts them
      value: v.value,
      color: v.color ?? null,
    })),
  };
}

// Categories: the API is an id/parentId tree; the Studio UI works in "A > B"
// path strings. Derive each path by walking parentId to the root, and keep a
// path -> id map so path-keyed mutations can address the right row.
interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  coverImageKey: string | null;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  productCount?: number;
}

function deriveCategories(rows: ApiCategory[]): {
  list: Category[];
  pathToId: Map<string, string>;
} {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (row: ApiCategory): string => {
    const seg: string[] = [];
    const seen = new Set<string>();
    let cur: ApiCategory | undefined = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      seg.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return seg.join(" > ");
  };
  const list: Category[] = [];
  const pathToId = new Map<string, string>();
  for (const r of rows) {
    const path = pathOf(r);
    pathToId.set(path, r.id);
    list.push({
      id: r.id,
      path,
      description: r.description ?? "",
      hasCover: !!r.coverImageKey,
      slug: r.slug,
      metaTitle: r.metaTitle ?? "",
      metaDesc: r.metaDescription ?? "",
      productCount: r.productCount ?? 0,
    });
  }
  list.sort((a, b) => a.path.localeCompare(b.path));
  return { list, pathToId };
}

// Split a Studio path into its leaf name and parent path ("" = top level).
function splitPath(path: string): { name: string; parentPath: string } {
  const i = path.lastIndexOf(" > ");
  return i === -1
    ? { name: path, parentPath: "" }
    : { name: path.slice(i + 3), parentPath: path.slice(0, i) };
}

interface StoreState {
  orders: Order[];
  products: Product[];
  productSummaries: ProductSummary[];
  productsLoading: boolean;
  discounts: Discount[];
  categories: Category[];
  attributes: AttributeDef[];
  attributesLoading: boolean;
  categoriesLoading: boolean;
  settings: StoreSettings;
  settingsDirty: boolean;
  pendingCount: number;
  actorLabel: string;
  mutateOrder: (num: number, fn: (o: Order) => void, eventTitle?: string, opts?: { note?: boolean }) => void;
  updateProducts: (fn: (products: Product[]) => Product[]) => void;
  // Real product-list actions (the summaries come from the API).
  bulkProducts: (
    action: "delete" | "status" | "addCategory",
    ids: string[],
    opts?: { status?: "Active" | "Draft"; categoryId?: string },
  ) => Promise<void>;
  upsertDiscount: (rec: Discount) => void;
  deleteDiscounts: (ids: string[]) => void;
  // Persist (create if new, else update) and return the saved record — callers
  // need the server-assigned id (e.g. the product editor's inline "New attribute").
  upsertAttribute: (rec: AttributeDef) => Promise<AttributeDef>;
  deleteAttribute: (id: string) => Promise<void>;
  upsertCategory: (cat: Category, originalPath?: string) => Promise<void>;
  deleteCategory: (path: string) => Promise<void>;
  addProductsToCategory: (productIds: string[], path: string) => void;
  patchSettings: (patch: Partial<StoreSettings>) => void;
  saveSettings: () => Promise<void>;
  discardSettings: () => void;
  anonymizeCustomer: (name: string) => void;
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [productSummaries, setProductSummaries] = useState<ProductSummary[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [discounts, setDiscounts] = useState<Discount[]>(seedDiscounts);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  // path -> server id, rebuilt on every categories load; lets path-keyed
  // mutations resolve the row (and a new category's parent) to an API id.
  const catPathToId = useRef<Map<string, string>>(new Map());
  const [attributes, setAttributes] = useState<AttributeDef[]>([]);
  const [attributesLoading, setAttributesLoading] = useState(true);
  // Mirror for the create-vs-update decision without re-creating the callback.
  const attributesRef = useRef(attributes);
  attributesRef.current = attributes;
  const [settings, setSettings] = useState<StoreSettings>(seedSettings);
  const [settingsSnap, setSettingsSnap] = useState<string>(() =>
    JSON.stringify(seedSettings),
  );

  // Fetch the category tree and re-derive paths + the path->id map. Called on
  // load and after every mutation (categories are few, so a full refetch keeps
  // slugs/reparenting/depth exactly in sync with the server).
  const reloadCategories = useCallback(async () => {
    const res = await api.get<{ categories: ApiCategory[] }>("/api/admin/categories");
    const { list, pathToId } = deriveCategories(res.categories);
    catPathToId.current = pathToId;
    setCategories(list);
  }, []);

  // Product list summaries (the editor loads full products by id separately).
  const reloadProducts = useCallback(async () => {
    const res = await api.get<{ products: ProductSummary[] }>("/api/admin/products");
    setProductSummaries(res.products);
  }, []);

  // Load API-backed data once the session is confirmed. Gating on `authed`
  // avoids a wasted 401 on the login screen and — since this provider mounts
  // outside the auth gate and never remounts — guarantees a fetch after a
  // fresh sign-in (a plain mount effect would miss it).
  useEffect(() => {
    if (status !== "authed") return;
    let alive = true;

    // Settings: the stored blob may be partial (first run is empty), so merge
    // over the seed defaults; snapshot so we start un-dirty.
    api
      .get<{ settings: Partial<StoreSettings> }>("/api/admin/settings")
      .then((res) => {
        if (!alive) return;
        const merged = { ...seedSettings, ...res.settings };
        setSettings(merged);
        setSettingsSnap(JSON.stringify(merged));
      })
      .catch(() => {
        /* keep seed defaults if the request fails */
      });

    // Attributes: full list, replacing any prior state.
    api
      .get<{ attributes: ApiAttribute[] }>("/api/admin/attributes")
      .then((res) => {
        if (!alive) return;
        setAttributes(res.attributes.map(mapAttribute));
      })
      .catch(() => {
        /* leave attributes empty on failure */
      })
      .finally(() => {
        if (alive) setAttributesLoading(false);
      });

    // Categories: the id/parentId tree, derived into Studio paths.
    reloadCategories()
      .catch(() => {
        /* leave categories empty on failure */
      })
      .finally(() => {
        if (alive) setCategoriesLoading(false);
      });

    // Products: list summaries.
    reloadProducts()
      .catch(() => {
        /* leave product list empty on failure */
      })
      .finally(() => {
        if (alive) setProductsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [status, reloadCategories, reloadProducts]);

  const actorLabel = "by Rashmi (owner)";

  const mutateOrder = useCallback<StoreState["mutateOrder"]>(
    (num, fn, eventTitle, opts) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.num !== num) return o;
          const n: Order = { ...o, lines: o.lines, events: [...o.events] };
          fn(n);
          if (eventTitle)
            n.events = [
              { min: 0, title: eventTitle, actor: actorLabel, note: opts?.note },
              ...n.events,
            ];
          return n;
        }),
      );
    },
    [actorLabel],
  );

  const updateProducts = useCallback<StoreState["updateProducts"]>((fn) => {
    setProducts((prev) => fn(prev));
  }, []);

  const bulkProducts = useCallback<StoreState["bulkProducts"]>(
    async (action, ids, opts) => {
      await api.post("/api/admin/products/bulk", {
        action,
        ids,
        // Studio uses Active/Draft; the API stores lowercase.
        status: opts?.status ? opts.status.toLowerCase() : undefined,
        categoryId: opts?.categoryId,
      });
      await reloadProducts();
    },
    [reloadProducts],
  );

  const upsertDiscount = useCallback((rec: Discount) => {
    setDiscounts((prev) =>
      prev.some((d) => d.id === rec.id)
        ? prev.map((d) => (d.id === rec.id ? rec : d))
        : [...prev, rec],
    );
  }, []);

  const deleteDiscounts = useCallback((ids: string[]) => {
    setDiscounts((prev) => prev.filter((d) => !ids.includes(d.id)));
  }, []);

  const upsertAttribute = useCallback<StoreState["upsertAttribute"]>(async (rec) => {
    // Update when the id already exists in state; otherwise create (the caller's
    // id is a client-fabricated placeholder the server replaces). Server ids are
    // UUIDs, placeholders are "aXXXX" — no collision either way.
    const existing = attributesRef.current.some((a) => a.id === rec.id);
    const body = attributeBody(rec);
    const res = existing
      ? await api.patch<{ attribute: ApiAttribute }>(`/api/admin/attributes/${rec.id}`, body)
      : await api.post<{ attribute: ApiAttribute }>("/api/admin/attributes", body);
    const saved = mapAttribute(res.attribute);
    setAttributes((prev) =>
      prev.some((a) => a.id === saved.id)
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [...prev, saved],
    );
    return saved;
  }, []);

  const deleteAttribute = useCallback<StoreState["deleteAttribute"]>(async (id) => {
    // Server enforces the in-use guard (409); let it reject so callers can toast.
    await api.del(`/api/admin/attributes/${id}`);
    setAttributes((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Create (no originalPath) or update. Name + parent are derived from the
  // Studio path; the server owns slug (deduped) and reparents descendants, so
  // we just POST/PATCH the one row and refetch the tree.
  const upsertCategory = useCallback<StoreState["upsertCategory"]>(
    async (cat, originalPath) => {
      const { name, parentPath } = splitPath(cat.path);
      const parentId = parentPath ? catPathToId.current.get(parentPath) ?? null : null;
      const body = {
        name,
        parentId,
        slug: cat.slug || undefined, // blank -> server slugifies the name
        description: cat.description || null,
        metaTitle: cat.metaTitle || null,
        metaDescription: cat.metaDesc || null,
      };
      const id = originalPath ? catPathToId.current.get(originalPath) : undefined;
      if (id) {
        await api.patch(`/api/admin/categories/${id}`, body);
      } else {
        await api.post("/api/admin/categories", body);
      }
      // Keep still-mock product assignments aligned when the path changes
      // (rename or move) — the same prefix remap the server applies to the tree.
      if (originalPath && originalPath !== cat.path) {
        const remap = (c: string) =>
          c === originalPath
            ? cat.path
            : c.startsWith(`${originalPath} > `)
              ? cat.path + c.slice(originalPath.length)
              : c;
        setProducts((prev) => prev.map((p) => ({ ...p, cats: p.cats.map(remap) })));
      }
      await reloadCategories();
    },
    [reloadCategories],
  );

  const deleteCategory = useCallback<StoreState["deleteCategory"]>(
    async (path) => {
      const id = catPathToId.current.get(path);
      if (!id) return;
      // Server moves children (and their product links) up to this node's
      // parent — never a cascade. Mirror that on still-mock product cats.
      await api.del(`/api/admin/categories/${id}`);
      const parent = path.includes(" > ") ? path.slice(0, path.lastIndexOf(" > ")) : "";
      const remap = (c: string): string | null =>
        c === path
          ? null
          : c.startsWith(`${path} > `)
            ? (parent ? `${parent} > ` : "") + c.slice(path.length + 3)
            : c;
      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          cats: p.cats
            .map(remap)
            .filter((c, i, a): c is string => !!c && a.indexOf(c) === i),
        })),
      );
      await reloadCategories();
    },
    [reloadCategories],
  );

  const addProductsToCategory = useCallback(
    (productIds: string[], path: string) => {
      const ids = new Set(productIds);
      setProducts((prev) =>
        prev.map((p) =>
          ids.has(p.id) && !p.cats.includes(path)
            ? { ...p, cats: [...p.cats, path] }
            : p,
        ),
      );
    },
    [],
  );

  const patchSettings = useCallback((patch: Partial<StoreSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveSettings = useCallback(async () => {
    const snapshot = JSON.stringify(settings);
    await api.put("/api/admin/settings", settings);
    setSettingsSnap(snapshot);
  }, [settings]);

  const discardSettings = useCallback(() => {
    setSettings(JSON.parse(settingsSnap) as StoreSettings);
  }, [settingsSnap]);

  const anonymizeCustomer = useCallback((name: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.cust === name
          ? { ...o, cust: "Deleted customer", email: "—", phone: "—", guest: true }
          : o,
      ),
    );
  }, []);

  const value = useMemo<StoreState>(
    () => ({
      orders,
      products,
      productSummaries,
      productsLoading,
      discounts,
      categories,
      categoriesLoading,
      attributes,
      attributesLoading,
      settings,
      settingsDirty: JSON.stringify(settings) !== settingsSnap,
      pendingCount: orders.filter((o) => o.status === "Pending").length,
      actorLabel,
      mutateOrder,
      updateProducts,
      bulkProducts,
      upsertDiscount,
      deleteDiscounts,
      upsertAttribute,
      deleteAttribute,
      upsertCategory,
      addProductsToCategory,
      deleteCategory,
      patchSettings,
      saveSettings,
      discardSettings,
      anonymizeCustomer,
    }),
    [
      orders, products, productSummaries, productsLoading, discounts, categories, categoriesLoading, attributes, attributesLoading, settings, settingsSnap, actorLabel,
      mutateOrder, updateProducts, bulkProducts, upsertDiscount, deleteDiscounts, upsertAttribute, deleteAttribute,
      upsertCategory, addProductsToCategory, deleteCategory, patchSettings, saveSettings,
      discardSettings, anonymizeCustomer,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
