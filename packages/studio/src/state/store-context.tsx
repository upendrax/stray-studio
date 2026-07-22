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
  seedCategories,
  seedDiscounts,
  seedOrders,
  seedProducts,
  seedSettings,
  pathSlug,
  type AttributeDef,
  type AttributeValue,
  type Category,
  type Discount,
  type Order,
  type Product,
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

interface StoreState {
  orders: Order[];
  products: Product[];
  discounts: Discount[];
  categories: Category[];
  attributes: AttributeDef[];
  attributesLoading: boolean;
  settings: StoreSettings;
  settingsDirty: boolean;
  pendingCount: number;
  actorLabel: string;
  mutateOrder: (num: number, fn: (o: Order) => void, eventTitle?: string, opts?: { note?: boolean }) => void;
  updateProducts: (fn: (products: Product[]) => Product[]) => void;
  upsertDiscount: (rec: Discount) => void;
  deleteDiscounts: (ids: string[]) => void;
  // Persist (create if new, else update) and return the saved record — callers
  // need the server-assigned id (e.g. the product editor's inline "New attribute").
  upsertAttribute: (rec: AttributeDef) => Promise<AttributeDef>;
  deleteAttribute: (id: string) => Promise<void>;
  upsertCategory: (cat: Category, originalPath?: string) => void;
  deleteCategory: (path: string) => void;
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
  const [discounts, setDiscounts] = useState<Discount[]>(seedDiscounts);
  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [attributes, setAttributes] = useState<AttributeDef[]>([]);
  const [attributesLoading, setAttributesLoading] = useState(true);
  // Mirror for the create-vs-update decision without re-creating the callback.
  const attributesRef = useRef(attributes);
  attributesRef.current = attributes;
  const [settings, setSettings] = useState<StoreSettings>(seedSettings);
  const [settingsSnap, setSettingsSnap] = useState<string>(() =>
    JSON.stringify(seedSettings),
  );

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

    return () => {
      alive = false;
    };
  }, [status]);

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

  // Create, or update (with rename when originalPath differs). Renaming a
  // category re-paths its descendants and every product's assignment.
  const upsertCategory = useCallback((cat: Category, originalPath?: string) => {
    const renaming = originalPath && originalPath !== cat.path;
    if (renaming) {
      const remap = (c: string) =>
        c === originalPath
          ? cat.path
          : c.startsWith(`${originalPath} > `)
            ? cat.path + c.slice(originalPath.length)
            : c;
      setCategories((prev) =>
        prev.map((x) =>
          x.path === originalPath || x.path.startsWith(`${originalPath} > `)
            ? { ...x, path: remap(x.path), slug: pathSlug(remap(x.path)) }
            : x,
        ).map((x) => (x.path === cat.path ? cat : x)),
      );
      setProducts((prev) => prev.map((p) => ({ ...p, cats: p.cats.map(remap) })));
      return;
    }
    setCategories((prev) =>
      prev.some((x) => x.path === cat.path)
        ? prev.map((x) => (x.path === cat.path ? cat : x))
        : [...prev, cat],
    );
  }, []);

  const deleteCategory = useCallback((path: string) => {
    // Children move up one level — never a cascade delete.
    const parent = path.includes(" > ") ? path.slice(0, path.lastIndexOf(" > ")) : "";
    const remap = (c: string): string | null =>
      c === path
        ? null
        : c.startsWith(`${path} > `)
          ? (parent ? `${parent} > ` : "") + c.slice(path.length + 3)
          : c;
    setCategories((prev) => {
      const seen = new Set<string>();
      const out: Category[] = [];
      for (const x of prev) {
        const np = remap(x.path);
        if (!np || seen.has(np)) continue;
        seen.add(np);
        out.push(np === x.path ? x : { ...x, path: np, slug: pathSlug(np) });
      }
      return out;
    });
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        cats: p.cats
          .map(remap)
          .filter((c, i, a): c is string => !!c && a.indexOf(c) === i),
      })),
    );
  }, []);

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
      discounts,
      categories,
      attributes,
      attributesLoading,
      settings,
      settingsDirty: JSON.stringify(settings) !== settingsSnap,
      pendingCount: orders.filter((o) => o.status === "Pending").length,
      actorLabel,
      mutateOrder,
      updateProducts,
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
      orders, products, discounts, categories, attributes, attributesLoading, settings, settingsSnap, actorLabel,
      mutateOrder, updateProducts, upsertDiscount, deleteDiscounts, upsertAttribute, deleteAttribute,
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
