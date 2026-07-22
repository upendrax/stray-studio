import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Bold, Italic, Link2, List, Plus, X, ImagePlus, Camera, ChevronRight, Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import { ApiError } from "@/lib/api";
import { cartesian, type AttributeDef, type Product } from "@/lib/mock-data";
import { AttributeDialog } from "@/components/attribute-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StockDot } from "@/components/stock-dot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Options come from global attributes — the product only chooses WHICH
// values apply (and carries per-value photos when the attribute wants them).
interface EditorOption {
  attrId: string;
  name: string;
  useImages: boolean;
  allValues: string[]; // from the attribute
  values: string[]; // selected for this product
  colors?: Record<string, string>; // value -> hex, when the attribute has swatches
}

interface EditorVariant {
  key: string;
  price: string;
  sku: string;
  qty: string;
  available: boolean;
}

// Which of the product's gallery images is assigned to each option value
// (Shopify-style: upload once to the product, then assign per group/variant).
// Keyed by the variant key for per-variant overrides, or the group value.
type ImageAssignments = Record<string, string>;

// Mock product media library (placeholder thumbnails).
const GALLERY = ["front.jpg", "back.jpg", "detail.jpg", "lifestyle.jpg"];

interface VariantGroup {
  value: string;
  color?: string;
  rows: { idx: number; subLabel: string }[];
}

// Group variants by the image-carrying option (Color), else the first option.
function groupVariants(ed: EditorState): {
  groupIdx: number;
  single: boolean;
  groups: VariantGroup[];
} {
  const gi = ed.options.findIndex((o) => o.useImages);
  const groupIdx = gi >= 0 ? gi : 0;
  const single = ed.options.length <= 1;
  const colors = ed.options[groupIdx]?.colors;
  const order: string[] = [];
  const map = new Map<string, VariantGroup>();
  ed.variants.forEach((v, idx) => {
    const parts = v.key.split(" / ");
    const value = parts[groupIdx] ?? v.key;
    const subLabel = parts.filter((_, i) => i !== groupIdx).join(" / ");
    if (!map.has(value)) {
      map.set(value, { value, color: colors?.[value], rows: [] });
      order.push(value);
    }
    map.get(value)!.rows.push({ idx, subLabel });
  });
  return { groupIdx, single, groups: order.map((v) => map.get(v)!) };
}

function priceRange(ed: EditorState, rows: { idx: number }[]): string {
  const nums = rows.map((r) => Number(ed.variants[r.idx]?.price) || 0);
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  return mn === mx
    ? `Rs. ${mn.toLocaleString("en-US")}`
    : `Rs. ${mn.toLocaleString("en-US")}–${mx.toLocaleString("en-US")}`;
}

interface EditorState {
  id: string | null;
  title: string;
  description: string;
  status: "Active" | "Draft";
  hasOptions: boolean;
  price: string;
  compareAt: string;
  chargeTax: boolean;
  costPerItem: string;
  sku: string;
  trackInv: boolean;
  qty: string;
  lowAt: string;
  options: EditorOption[];
  variants: EditorVariant[];
  cats: string[];
  tags: string[];
  tagInput: string;
  images: ImageAssignments;
  optionsTouched: boolean;
}

function colorMap(attr: AttributeDef): Record<string, string> | undefined {
  if (!attr.useColor) return undefined;
  return Object.fromEntries(
    attr.values.filter((v) => v.color).map((v) => [v.value, v.color!]),
  );
}

function fromProduct(p: Product, attributes: AttributeDef[]): EditorState {
  return {
    id: p.id,
    title: p.name,
    description: "",
    status: p.status,
    hasOptions: p.type === "variable",
    price:
      p.price != null
        ? String(p.price)
        : p.basePrice != null
          ? String(p.basePrice)
          : "2500",
    compareAt: p.compareAt ? String(p.compareAt) : "",
    chargeTax: p.chargeTax ?? false,
    costPerItem: p.costPerItem ? String(p.costPerItem) : "",
    sku: p.sku ?? "",
    trackInv: p.trackInv !== false,
    qty: p.qty != null ? String(p.qty) : "0",
    lowAt: String(p.lowAt ?? 5),
    options: (p.options ?? []).map((o) => {
      const attr = attributes.find((a) => a.name === o.name);
      return {
        attrId: attr?.id ?? o.name,
        name: o.name,
        useImages: o.useImages,
        allValues: attr ? attr.values.map((v) => v.value) : [...o.values],
        values: [...o.values],
        colors: attr ? colorMap(attr) : undefined,
      };
    }),
    variants: (p.variants ?? []).map((v) => ({ key: v.key, price: String(v.price), sku: v.sku, qty: String(v.qty), available: v.available })),
    cats: [...p.cats],
    tags: [...p.tags],
    tagInput: "",
    images: {},
    optionsTouched: false,
  };
}

function blank(): EditorState {
  return {
    id: null, title: "", description: "", status: "Draft",
    hasOptions: false, price: "", compareAt: "", chargeTax: false, costPerItem: "", sku: "", trackInv: true,
    qty: "0", lowAt: "5", options: [], variants: [],
    cats: [], tags: [], tagInput: "", images: {}, optionsTouched: false,
  };
}

function regenVariants(e: EditorState): EditorVariant[] {
  const opts = e.options.filter((o) => o.values.length);
  if (!opts.length) return [];
  return cartesian(opts.map((o) => o.values)).map((c) => {
    const key = c.join(" / ");
    return (
      e.variants.find((v) => v.key === key) ?? {
        key,
        price: e.price || "2500",
        sku: "",
        qty: "0",
        available: true,
      }
    );
  });
}

export default function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, updateProducts, attributes, upsertAttribute, categories } =
    useStore();

  const source = id ? products.find((p) => p.id === id) : null;
  const initial = useMemo(
    () => (source ? fromProduct(source, attributes) : blank()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const [ed, setEdState] = useState<EditorState>(initial);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<"discard" | "delete" | null>(null);
  const [attrDialogOpen, setAttrDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // The image-assignment key currently being picked for ("" = closed).
  const [imgFor, setImgFor] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState("");

  // Category picker rows: flat filtered list when searching, else indented tree.
  const catRows = (() => {
    const q = catSearch.trim().toLowerCase();
    if (q) {
      return categories
        .filter((c) => c.path.toLowerCase().includes(q))
        .map((c) => ({ path: c.path, depth: 0, flat: true }));
    }
    const rows: { path: string; depth: number; flat: boolean }[] = [];
    const walk = (path: string) => {
      const depth = path.split(" > ").length - 1;
      rows.push({ path, depth, flat: false });
      categories
        .filter(
          (c) => c.path.startsWith(`${path} > `) && c.path.split(" > ").length === depth + 2,
        )
        .forEach((c) => walk(c.path));
    };
    categories.filter((c) => !c.path.includes(" > ")).forEach((c) => walk(c.path));
    return rows;
  })();

  const toggleCat = (path: string) =>
    setEd({
      cats: ed.cats.includes(path)
        ? ed.cats.filter((x) => x !== path)
        : [...ed.cats, path],
    });

  const remainingAttrs = attributes.filter(
    (a) => !ed.options.some((o) => o.attrId === a.id),
  );

  if (id && !source) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Product not found.
      </Card>
    );
  }

  const setEd = (patch: Partial<EditorState>) => {
    setEdState((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const setOptions = (options: EditorOption[], touched = true) => {
    setEdState((s) => {
      const next = { ...s, options, optionsTouched: touched || s.optionsTouched };
      next.variants = regenVariants(next);
      return next;
    });
    setDirty(true);
  };

  const toggleHasOptions = () => {
    setEdState((s) => {
      const on = !s.hasOptions;
      const next = { ...s, hasOptions: on };
      if (on && !next.options.length) {
        const first =
          attributes.find((a) => a.name === "Size") ?? attributes[0];
        if (first) {
          next.options = [
            {
              attrId: first.id,
              name: first.name,
              useImages: first.useImages,
              allValues: first.values.map((v) => v.value),
              values: first.values.map((v) => v.value),
              colors: colorMap(first),
            },
          ];
          next.price = next.price || "2500";
          next.variants = regenVariants(next);
        }
      }
      return next;
    });
    setDirty(true);
  };

  const addOptionFromAttr = (a: AttributeDef) => {
    setOptions([
      ...ed.options,
      {
        attrId: a.id,
        name: a.name,
        useImages: a.useImages,
        allValues: a.values.map((v) => v.value),
        values: a.values.map((v) => v.value),
        colors: colorMap(a),
      },
    ]);
  };

  const toggleValue = (oi: number, v: string) => {
    setOptions(
      ed.options.map((x, i) =>
        i === oi
          ? {
              ...x,
              values: x.allValues.filter((av) =>
                av === v ? !x.values.includes(v) : x.values.includes(av),
              ),
            }
          : x,
      ),
    );
  };

  const setVariant = (vi: number, patch: Partial<EditorVariant>) => {
    setEdState((s) => ({
      ...s,
      variants: s.variants.map((v, i) => (i === vi ? { ...v, ...patch } : v)),
    }));
    setDirty(true);
  };

  // The Pricing card's Price is the base for variants. Editing it updates
  // every variant still sitting at the old base; overridden ones stay put.
  const setBasePrice = (value: string) => {
    setEdState((s) => {
      const old = s.price;
      const variants = s.hasOptions
        ? s.variants.map((v) => (v.price === old ? { ...v, price: value } : v))
        : s.variants;
      return { ...s, price: value, variants };
    });
    setDirty(true);
  };

  const assignImage = (key: string, img: string | null) => {
    setEdState((s) => {
      const images = { ...s.images };
      if (img) images[key] = img;
      else delete images[key];
      return { ...s, images };
    });
    setDirty(true);
  };

  const save = () => {
    if (!ed.title.trim()) return;
    const rec: Product = {
      id: ed.id ?? `p${Math.random().toString(36).slice(2, 6)}`,
      name: ed.title.trim(),
      status: ed.status,
      type: ed.hasOptions ? "variable" : "simple",
      updatedMin: 0,
      cats: ed.cats,
      tags: ed.tags,
      ...(ed.hasOptions
        ? {
            basePrice: Number(ed.price) || 0,
            options: ed.options
              .filter((o) => o.values.length)
              .map((o) => ({
                name: o.name,
                values: o.values,
                useImages: o.useImages,
              })),
            variants: ed.variants.map((v) => ({
              key: v.key,
              price: Number(v.price) || 0,
              sku: v.sku,
              qty: Number(v.qty) || 0,
              available: v.available,
            })),
          }
        : {
            price: Number(ed.price) || 0,
            compareAt: ed.compareAt ? Number(ed.compareAt) : "",
            chargeTax: ed.chargeTax,
            costPerItem: ed.costPerItem ? Number(ed.costPerItem) : "",
            sku: ed.sku,
            trackInv: ed.trackInv,
            qty: Number(ed.qty) || 0,
            lowAt: Number(ed.lowAt) || 5,
          }),
    };
    updateProducts((prev) => {
      const exists = prev.some((p) => p.id === rec.id);
      return exists ? prev.map((p) => (p.id === rec.id ? rec : p)) : [rec, ...prev];
    });
    setDirty(false);
    toast("Product saved");
    navigate("/products");
  };

  const deleteProduct = () => {
    updateProducts((prev) => prev.filter((p) => p.id !== ed.id));
    toast("Product deleted");
    navigate("/products");
  };

  return (
    <div>
      {/* Page header with back navigation */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title="Back to products"
          onClick={() => (dirty ? setDialog("discard") : navigate("/products"))}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[16px] font-semibold tracking-tight">
          {ed.id ? ed.title.trim() || "Edit product" : "New product"}
        </h1>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Basics */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Basics</div>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input
                value={ed.title}
                onChange={(e) => setEd({ title: e.target.value })}
                placeholder="e.g. Oversized Tee"
                className="h-9"
              />
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label>Description</Label>
              <div className="overflow-hidden rounded-md border border-input">
                <div className="flex gap-0.5 border-b bg-muted px-1.5 py-1">
                  {[Bold, Italic, List, Link2].map((Icon, i) => (
                    <button
                      key={i}
                      className="flex h-[22px] w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Icon className="size-3" />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={ed.description}
                  onChange={(e) => setEd({ description: e.target.value })}
                  placeholder="Describe the product…"
                  className="min-h-[72px] resize-y rounded-none border-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </Card>

          {/* Images */}
          <Card className="gap-0 p-4">
            <div className="font-semibold">Images</div>
            <div className="mb-3 text-xs text-muted-foreground">
              These photos show by default. You can add photos for each color below.
            </div>
            <div className="flex flex-wrap gap-2">
              {(ed.id ? ["product photo — front", "product photo — back", "detail shot"] : []).map(
                (label, i) => (
                  <div
                    key={label}
                    className="relative flex size-[88px] items-center justify-center rounded-md border p-1.5 text-center font-mono text-[9px] text-muted-foreground"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, var(--muted), var(--muted) 7px, var(--background) 7px, var(--background) 14px)",
                    }}
                  >
                    {label}
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-px font-sans text-[9px] font-semibold text-primary-foreground">
                        Cover
                      </span>
                    )}
                  </div>
                ),
              )}
              <button className="flex size-[88px] flex-col items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed text-muted-foreground hover:border-ring hover:text-foreground">
                <ImagePlus className="size-4" />
                <span className="text-[10px]">Upload</span>
              </button>
            </div>
          </Card>

          {/* Pricing — the Price acts as the base for all variants */}
          <Card className="gap-0 p-4">
              <div className="mb-3 font-semibold">Pricing</div>
              <div className="flex flex-wrap gap-3">
                <div className="grid w-[240px] gap-1.5">
                  <Label>Price (Rs.)</Label>
                  <Input
                    value={ed.price}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="h-9 tabular-nums"
                  />
                </div>
                <div className="grid w-[240px] gap-1.5">
                  <Label>Compare-at price</Label>
                  <Input
                    value={ed.compareAt}
                    onChange={(e) => setEd({ compareAt: e.target.value })}
                    placeholder="Optional"
                    className="h-9 tabular-nums"
                  />
                </div>
              </div>
              <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox
                  checked={ed.chargeTax}
                  onCheckedChange={(c) => setEd({ chargeTax: c === true })}
                />
                Charge tax on this product
              </label>
              {ed.chargeTax && (
                <>
                  <Separator className="my-3.5" />
                  <div className="grid w-[240px] gap-1.5">
                    <Label>Cost per item (Rs.)</Label>
                    <Input
                      value={ed.costPerItem}
                      onChange={(e) => setEd({ costPerItem: e.target.value })}
                      placeholder="0.00"
                      className="h-9 tabular-nums"
                    />
                    <div className="text-[11px] text-muted-foreground">
                      Customers won't see this.
                    </div>
                  </div>
                </>
              )}
          </Card>

          {/* Inventory — simple products only; variable products track per variant */}
          {!ed.hasOptions && (
            <Card className="gap-0 p-4">
              <div className="mb-3 font-semibold">Inventory</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={ed.trackInv}
                  onCheckedChange={() => setEd({ trackInv: !ed.trackInv })}
                />
                <span className="text-[13px]">Track inventory</span>
              </div>
              {ed.trackInv && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <div className="grid w-[240px] gap-1.5">
                    <Label>Quantity</Label>
                    <Input
                      value={ed.qty}
                      onChange={(e) => setEd({ qty: e.target.value })}
                      className="h-9 tabular-nums"
                    />
                  </div>
                  <div className="grid w-[240px] gap-1.5">
                    <Label>Low stock alert at</Label>
                    <Input
                      value={ed.lowAt}
                      onChange={(e) => setEd({ lowAt: e.target.value })}
                      className="h-9 tabular-nums"
                    />
                  </div>
                </div>
              )}
              <div className="mt-3 grid w-[240px] gap-1.5">
                <Label>SKU</Label>
                <Input
                  value={ed.sku}
                  onChange={(e) => setEd({ sku: e.target.value })}
                  placeholder="Optional"
                  className="h-9"
                />
                <div className="text-[11px] text-muted-foreground">
                  Your internal product code
                </div>
              </div>
            </Card>
          )}

          {/* Variants */}
          <Card className="gap-0 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Variants</div>
                <div className="text-xs text-muted-foreground">
                  {ed.hasOptions
                    ? "Prices, SKUs and stock are set per variant below."
                    : "This product has options like size or color"}
                </div>
              </div>
              <Switch checked={ed.hasOptions} onCheckedChange={toggleHasOptions} />
            </div>

            {ed.hasOptions && (
              <div className="mt-4 flex flex-col gap-3">
                {ed.options.map((opt, oi) => {
                  return (
                    <div key={opt.attrId} className="rounded-md border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium">{opt.name}</span>
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Remove option"
                          onClick={() => setOptions(ed.options.filter((_, i) => i !== oi))}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {opt.allValues.map((v) => {
                          const sel = opt.values.includes(v);
                          return (
                            <button
                              key={v}
                              onClick={() => toggleValue(oi, v)}
                              className={cn(
                                "inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-xs",
                                sel
                                  ? "border-primary/40 bg-muted font-medium text-foreground"
                                  : "border-dashed text-muted-foreground hover:border-ring",
                              )}
                            >
                              {opt.colors?.[v] && (
                                <span
                                  className="size-3 rounded-full border"
                                  style={{ background: opt.colors[v] }}
                                />
                              )}
                              {v}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        Click values to include them for this product.
                      </div>
                    </div>
                  );
                })}

                {ed.options.length < 3 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="self-start">
                        <Plus className="size-3.5" />
                        Add option
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      {remainingAttrs.map((a) => (
                        <DropdownMenuItem key={a.id} onClick={() => addOptionFromAttr(a)}>
                          {a.name}
                          {a.useImages && (
                            <Camera className="ml-auto size-3 text-muted-foreground" />
                          )}
                        </DropdownMenuItem>
                      ))}
                      {remainingAttrs.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem onClick={() => setAttrDialogOpen(true)}>
                        New attribute…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {!!ed.id && ed.optionsTouched && (
                  <div className="rounded-md bg-status-pending-bg px-3 py-2 text-xs text-status-pending-fg">
                    Changing options will regenerate variants. Stock for removed
                    variants will be archived.
                  </div>
                )}

                {/* Grouped variants table */}
                {(() => {
                  const { single, groups } = groupVariants(ed);
                  const totalVariants = ed.variants.length;
                  const allExpanded = groups.every((g) => expanded[g.value]);
                  const groupName = ed.options[groupVariants(ed).groupIdx]?.name ?? "";

                  const imgThumb = (key: string, size: string) => {
                    const img = ed.images[key];
                    return (
                      <button
                        onClick={() => setImgFor(key)}
                        title={img ? `${img} — change` : "Assign image"}
                        className={cn(
                          "flex shrink-0 items-center justify-center overflow-hidden rounded-md border",
                          size,
                          img ? "" : "border-dashed text-muted-foreground hover:border-ring",
                        )}
                        style={
                          img
                            ? {
                                background:
                                  "repeating-linear-gradient(45deg, var(--muted), var(--muted) 5px, var(--background) 5px, var(--background) 10px)",
                              }
                            : undefined
                        }
                      >
                        {!img && <ImagePlus className="size-3.5" />}
                      </button>
                    );
                  };

                  return (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {totalVariants} variant{totalVariants === 1 ? "" : "s"}
                          {!single && ` · grouped by ${groupName}`}
                        </div>
                        {!single && (
                          <button
                            onClick={() => {
                              const next: Record<string, boolean> = {};
                              if (!allExpanded) for (const g of groups) next[g.value] = true;
                              setExpanded(next);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {allExpanded ? "Collapse all" : "Expand all"}
                          </button>
                        )}
                      </div>

                      <div className="overflow-hidden rounded-md border">
                        {/* header */}
                        <div className="grid grid-cols-[44px_minmax(140px,1fr)_120px_90px_70px] gap-2.5 border-b bg-muted px-3 py-[7px] text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <span />
                          <span>Variant</span>
                          <span>Price (Rs.)</span>
                          <span>Quantity</span>
                          <span className="text-center">Available</span>
                        </div>

                        {groups.map((g) => {
                          if (single) {
                            // One option → the group value IS the variant (flat row)
                            const { idx } = g.rows[0]!;
                            const v = ed.variants[idx]!;
                            const qn = Number(v.qty) || 0;
                            return (
                              <div
                                key={g.value}
                                className="grid grid-cols-[44px_minmax(140px,1fr)_120px_90px_70px] items-center gap-2.5 border-b px-3 py-1.5 text-[13px] tabular-nums last:border-b-0"
                              >
                                {imgThumb(g.value, "size-9")}
                                <span className="flex items-center gap-2 font-medium">
                                  {g.color && (
                                    <span
                                      className="size-3 shrink-0 rounded-full border"
                                      style={{ background: g.color }}
                                    />
                                  )}
                                  {!g.color && (
                                    <StockDot level={qn <= 0 ? "out" : qn <= 5 ? "low" : "ok"} />
                                  )}
                                  {g.value}
                                </span>
                                <Input
                                  value={v.price}
                                  onChange={(e) => setVariant(idx, { price: e.target.value })}
                                  className="h-9 px-2 tabular-nums"
                                />
                                <Input
                                  value={v.qty}
                                  onChange={(e) => setVariant(idx, { qty: e.target.value })}
                                  className="h-9 px-2 tabular-nums"
                                />
                                <span className="flex justify-center">
                                  <Switch
                                    checked={v.available}
                                    onCheckedChange={() =>
                                      setVariant(idx, { available: !v.available })
                                    }
                                    className="scale-90"
                                  />
                                </span>
                              </div>
                            );
                          }

                          // Multi-option → group header + expandable sub-rows
                          const isOpen = !!expanded[g.value];
                          const totalQty = g.rows.reduce(
                            (s, r) => s + (Number(ed.variants[r.idx]?.qty) || 0),
                            0,
                          );
                          return (
                            <div key={g.value} className="border-b last:border-b-0">
                              {/* group header */}
                              <div className="grid grid-cols-[44px_minmax(140px,1fr)_120px_90px_70px] items-center gap-2.5 px-3 py-1.5 text-[13px] tabular-nums">
                                {imgThumb(g.value, "size-9")}
                                <button
                                  onClick={() =>
                                    setExpanded((s) => ({ ...s, [g.value]: !s[g.value] }))
                                  }
                                  className="flex items-center gap-2 text-left font-medium"
                                >
                                  {g.color && (
                                    <span
                                      className="size-3 shrink-0 rounded-full border"
                                      style={{ background: g.color }}
                                    />
                                  )}
                                  {g.value}
                                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                                    · {g.rows.length} variants
                                    <ChevronRight
                                      className={cn(
                                        "size-3 transition-transform",
                                        isOpen && "rotate-90",
                                      )}
                                    />
                                  </span>
                                </button>
                                <span className="px-2 text-xs text-muted-foreground">
                                  {priceRange(ed, g.rows)}
                                </span>
                                <span className="px-2 text-xs text-muted-foreground">
                                  {totalQty}
                                </span>
                                <span />
                              </div>

                              {/* sub-rows */}
                              {isOpen &&
                                g.rows.map((r) => {
                                  const v = ed.variants[r.idx]!;
                                  const qn = Number(v.qty) || 0;
                                  return (
                                    <div
                                      key={v.key}
                                      className="grid grid-cols-[44px_minmax(140px,1fr)_120px_90px_70px] items-center gap-2.5 border-t bg-muted/30 py-1.5 pl-3 pr-3 text-[13px] tabular-nums"
                                    >
                                      {imgThumb(v.key, "size-7")}
                                      <span className="flex items-center gap-2 pl-4">
                                        <StockDot
                                          level={qn <= 0 ? "out" : qn <= 5 ? "low" : "ok"}
                                        />
                                        {r.subLabel}
                                      </span>
                                      <Input
                                        value={v.price}
                                        onChange={(e) =>
                                          setVariant(r.idx, { price: e.target.value })
                                        }
                                        className="h-9 px-2 tabular-nums"
                                      />
                                      <Input
                                        value={v.qty}
                                        onChange={(e) =>
                                          setVariant(r.idx, { qty: e.target.value })
                                        }
                                        className="h-9 px-2 tabular-nums"
                                      />
                                      <span className="flex justify-center">
                                        <Switch
                                          checked={v.available}
                                          onCheckedChange={() =>
                                            setVariant(r.idx, { available: !v.available })
                                          }
                                          className="scale-90"
                                        />
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Status</div>
            <Select
              value={ed.status}
              onValueChange={(v) => setEd({ status: v as EditorState["status"] })}
            >
              <SelectTrigger className="h-9 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Draft products aren't visible in your store
            </div>
          </Card>

          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Categories</div>
            <div className="overflow-hidden rounded-md border">
              <div className="relative border-b">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Search categories"
                  className="h-9 w-full bg-transparent pl-[30px] pr-2 text-[13px] outline-none"
                />
              </div>
              <div className="max-h-[188px] overflow-y-auto p-1">
                {catRows.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {catSearch ? "No matches." : "No categories yet."}
                  </div>
                ) : (
                  catRows.map((r) => (
                    <label
                      key={r.path}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent"
                      style={{ paddingLeft: 6 + (r.flat ? 0 : r.depth * 16) }}
                    >
                      <Checkbox
                        checked={ed.cats.includes(r.path)}
                        onCheckedChange={() => toggleCat(r.path)}
                      />
                      <span className="min-w-0 truncate text-[13px]">
                        {r.flat && r.path.includes(" > ") ? (
                          <>
                            <span className="text-muted-foreground">
                              {r.path
                                .slice(0, r.path.lastIndexOf(" > "))
                                .replace(/ > /g, " › ")}{" "}
                              ›{" "}
                            </span>
                            {r.path.split(" > ").pop()}
                          </>
                        ) : (
                          r.path.split(" > ").pop()
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Tags</div>
            {ed.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {ed.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex min-h-6 items-center gap-1.5 rounded-md border bg-muted px-2 py-0.5 text-xs"
                  >
                    {t}
                    <button
                      onClick={() => setEd({ tags: ed.tags.filter((x) => x !== t) })}
                      className="flex text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-[11px]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              value={ed.tagInput}
              onChange={(e) => setEd({ tagInput: e.target.value })}
              onKeyDown={(e) => {
                const val = ed.tagInput.trim();
                if (e.key === "Enter" && val && !ed.tags.includes(val))
                  setEd({ tags: [...ed.tags, val], tagInput: "" });
              }}
              placeholder="Add tag + Enter"
              className="h-9"
            />
          </Card>

          {ed.status === "Active" && (
            <Card className="gap-0 px-4 py-3.5">
              <button className="flex items-center gap-1.5 text-[13px] font-medium hover:text-muted-foreground">
                View in store ↗
              </button>
            </Card>
          )}

          {ed.id && (
            <Card className="gap-0 border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] px-4 py-3.5">
              <div className="mb-2 font-semibold">Danger zone</div>
              <Button
                variant="outline"
                size="sm"
                className="self-start text-destructive"
                onClick={() => setDialog("delete")}
              >
                Delete product
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="pointer-events-none sticky bottom-4 z-40 flex justify-center px-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-[10px] border bg-popover py-2 pl-4 pr-2 shadow-lg">
            <span className="text-[13px]">Unsaved changes</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setDialog("discard")}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={!ed.title.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="w-[400px]">
          {dialog === "discard" && (
            <>
              <DialogHeader>
                <DialogTitle>Discard unsaved changes?</DialogTitle>
                <DialogDescription>
                  You have unsaved changes on this page. If you leave now,
                  they'll be lost.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Keep editing
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => navigate("/products")}
                >
                  Discard changes
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete "{ed.title || "this product"}"?</DialogTitle>
                <DialogDescription>This can't be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={deleteProduct}>
                  Delete product
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Inline attribute creation — saves globally, then adds to this product */}
      <AttributeDialog
        open={attrDialogOpen}
        initial={null}
        existingNames={attributes.map((a) => a.name)}
        onClose={() => setAttrDialogOpen(false)}
        onSave={async (rec) => {
          // Persist globally first — the option must reference the server-assigned
          // id, not a client placeholder, so await the saved record.
          try {
            const saved = await upsertAttribute({
              ...rec,
              id: `a${Math.random().toString(36).slice(2, 6)}`,
            });
            addOptionFromAttr(saved);
            toast("Attribute created");
          } catch (e) {
            toast(e instanceof ApiError ? e.message : "Couldn't create attribute");
          }
        }}
      />

      {/* Select image — pick from the product's media library (upload once, assign) */}
      <Dialog open={imgFor !== null} onOpenChange={(open) => { if (!open) setImgFor(null); }}>
        <DialogContent className="w-[480px]">
          <DialogHeader>
            <DialogTitle>Select image</DialogTitle>
            <DialogDescription>
              Pick from this product's photos, or upload more.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            <button className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed text-muted-foreground hover:border-ring">
              <ImagePlus className="size-4" />
              <span className="text-[10px]">Upload</span>
            </button>
            {GALLERY.map((img) => {
              const active = imgFor && ed.images[imgFor] === img;
              return (
                <button
                  key={img}
                  onClick={() => {
                    if (imgFor) assignImage(imgFor, active ? null : img);
                    setImgFor(null);
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md border text-center font-mono text-[8px] text-muted-foreground",
                    active && "ring-2 ring-ring",
                  )}
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, var(--muted), var(--muted) 6px, var(--background) 6px, var(--background) 12px)",
                  }}
                >
                  {img}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (imgFor) assignImage(imgFor, null);
                setImgFor(null);
              }}
            >
              Remove image
            </Button>
            <Button size="sm" onClick={() => setImgFor(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
