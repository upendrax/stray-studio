import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  seedAttributes,
  seedCategories,
  seedDiscounts,
  seedOrders,
  seedProducts,
  seedSettings,
  pathSlug,
  type AttributeDef,
  type Category,
  type Discount,
  type Order,
  type Product,
  type StoreSettings,
} from "@/lib/mock-data";
import { api } from "@/lib/api";

// Transitional store. Settings are wired to the real API (#3b); the rest
// (orders/products/discounts/categories/attributes) stay mock until their
// pages are migrated. Seed values act as the pre-load fallback.

interface StoreState {
  orders: Order[];
  products: Product[];
  discounts: Discount[];
  categories: Category[];
  attributes: AttributeDef[];
  settings: StoreSettings;
  settingsDirty: boolean;
  pendingCount: number;
  actorLabel: string;
  mutateOrder: (num: number, fn: (o: Order) => void, eventTitle?: string, opts?: { note?: boolean }) => void;
  updateProducts: (fn: (products: Product[]) => Product[]) => void;
  upsertDiscount: (rec: Discount) => void;
  deleteDiscounts: (ids: string[]) => void;
  upsertAttribute: (rec: AttributeDef) => void;
  deleteAttribute: (id: string) => void;
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
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [discounts, setDiscounts] = useState<Discount[]>(seedDiscounts);
  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [attributes, setAttributes] = useState<AttributeDef[]>(seedAttributes);
  const [settings, setSettings] = useState<StoreSettings>(seedSettings);
  const [settingsSnap, setSettingsSnap] = useState<string>(() =>
    JSON.stringify(seedSettings),
  );

  // Load real settings on mount. The stored blob may be partial (first run is
  // empty), so merge over the seed defaults; snapshot so we start un-dirty.
  useEffect(() => {
    let alive = true;
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
    return () => {
      alive = false;
    };
  }, []);

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

  const upsertAttribute = useCallback((rec: AttributeDef) => {
    setAttributes((prev) =>
      prev.some((a) => a.id === rec.id)
        ? prev.map((a) => (a.id === rec.id ? rec : a))
        : [...prev, rec],
    );
  }, []);

  const deleteAttribute = useCallback((id: string) => {
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
      orders, products, discounts, categories, attributes, settings, settingsSnap, actorLabel,
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
