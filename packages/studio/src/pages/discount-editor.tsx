import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import { ApiError } from "@/lib/api";
import { discountStatus, makeDiscount, type Discount } from "@/lib/mock-data";
import { moneyShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-status-delivered-bg text-status-delivered-fg",
  Scheduled: "bg-status-paid-bg text-status-paid-fg",
  Expired: "bg-status-cancelled-bg text-status-cancelled-fg",
  Disabled: "bg-status-cancelled-bg text-status-cancelled-fg",
};

export default function DiscountEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    discounts,
    discountsLoading,
    categories,
    productSummaries,
    upsertDiscount,
    deleteDiscounts,
  } = useStore();

  const [d, setD] = useState<Discount>(makeDiscount);
  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");

  // Populate from the store collection once it has loaded (so a hard reload
  // straight to /discounts/edit/:id doesn't briefly read an empty list).
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (discountsLoading) return;
    const src = discounts.find((x) => x.id === id);
    if (src) setD({ ...src });
    else setNotFound(true);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, discountsLoading]);

  if (notFound) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Discount not found.
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center px-6 py-16 text-muted-foreground shadow-sm">
        <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </Card>
    );
  }

  const patch = (p: Partial<Discount>) => {
    setD((s) => ({ ...s, ...p }));
    setDirty(true);
  };

  // ---- validation ----
  const codeErr =
    d.code.trim() && discounts.some((x) => x.code === d.code.trim() && x.id !== d.id)
      ? "This code already exists"
      : null;
  const pctN = Number(d.pct);
  const pctErr =
    d.type === "pct" && d.pct !== "" && (!(pctN >= 1) || pctN > 100)
      ? "Must be between 1 and 100"
      : null;
  const invalid =
    !d.code.trim() ||
    !!codeErr ||
    (d.type === "pct" && (!!pctErr || d.pct === "")) ||
    (d.type === "amt" && !d.amt.trim());

  const canScope = d.type !== "ship"; // free shipping is always order-level

  const save = async () => {
    if (invalid || saving) return;
    setSaving(true);
    try {
      await upsertDiscount({
        ...d,
        code: d.code.trim(),
        id: d.id || `d${Math.random().toString(36).slice(2, 6)}`,
        applies: canScope ? d.applies : "order",
      });
      setDirty(false);
      toast(id ? "Discount saved" : "Discount created");
      navigate("/discounts");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save discount");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      if (id) await deleteDiscounts([id]);
      toast("Discount deleted");
      navigate("/discounts");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete discount");
      setConfirmDelete(false);
    }
  };

  const back = () => (dirty ? setConfirmDiscard(true) : navigate("/discounts"));

  const generateCode = () => {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 8; i++) c += A[Math.floor(Math.random() * A.length)];
    patch({ code: c });
  };

  // ---- category tree for the picker ----
  const catRows = (() => {
    const q = catSearch.trim().toLowerCase();
    if (q)
      return categories
        .filter((c) => c.path.toLowerCase().includes(q))
        .map((c) => ({ path: c.path, depth: 0, flat: true }));
    const rows: { path: string; depth: number; flat: boolean }[] = [];
    const walk = (path: string) => {
      const depth = path.split(" > ").length - 1;
      rows.push({ path, depth, flat: false });
      categories
        .filter((c) => c.path.startsWith(`${path} > `) && c.path.split(" > ").length === depth + 2)
        .forEach((c) => walk(c.path));
    };
    categories.filter((c) => !c.path.includes(" > ")).forEach((c) => walk(c.path));
    return rows;
  })();
  const prodRows = productSummaries.filter(
    (p) => !prodSearch.trim() || p.title.toLowerCase().includes(prodSearch.trim().toLowerCase()),
  );

  const toggleCat = (path: string) =>
    patch({
      appliesCategories: d.appliesCategories.includes(path)
        ? d.appliesCategories.filter((x) => x !== path)
        : [...d.appliesCategories, path],
    });
  const toggleProd = (pid: string) =>
    patch({
      appliesProducts: d.appliesProducts.includes(pid)
        ? d.appliesProducts.filter((x) => x !== pid)
        : [...d.appliesProducts, pid],
    });

  // ---- summary ----
  const valueLabel =
    d.type === "ship"
      ? "Free shipping"
      : d.type === "pct"
        ? `${d.pct || 0}% off`
        : `${moneyShort(Number(d.amt) || 0)} off`;
  const appliesLabel =
    !canScope || d.applies === "order"
      ? "Entire order"
      : d.applies === "categories"
        ? `${d.appliesCategories.length} categor${d.appliesCategories.length === 1 ? "y" : "ies"}`
        : `${d.appliesProducts.length} product${d.appliesProducts.length === 1 ? "" : "s"}`;
  const minLabel =
    d.minType === "amount"
      ? `Min. ${moneyShort(Number(d.min) || 0)}`
      : d.minType === "quantity"
        ? `Min. ${d.minQty || 0} items`
        : "No minimum";
  const status = discountStatus(d);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title="Back to discounts"
          onClick={back}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[16px] font-semibold tracking-tight">
          {id ? d.code.trim() || "Edit discount" : "Create discount"}
        </h1>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        {/* Main */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Code */}
          <Card className="gap-0 p-4">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Discount code</Label>
                <button
                  onClick={generateCode}
                  className="text-xs text-primary hover:underline"
                >
                  Generate random code
                </button>
              </div>
              <Input
                value={d.code}
                onChange={(e) => patch({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                placeholder="e.g. WELCOME10"
                className="font-mono uppercase"
              />
              {codeErr && <div className="text-xs text-destructive">{codeErr}</div>}
              <div className="text-[11px] text-muted-foreground">
                Customers enter this code at checkout.
              </div>
            </div>
          </Card>

          {/* Value */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Discount value</div>
            <div className="flex flex-wrap gap-3">
              <div className="grid w-[220px] gap-1.5">
                <Label>Type</Label>
                <Select value={d.type} onValueChange={(v) => patch({ type: v as Discount["type"] })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct">Percentage</SelectItem>
                    <SelectItem value="amt">Fixed amount</SelectItem>
                    <SelectItem value="ship">Free shipping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {d.type === "pct" && (
                <div className="grid w-[140px] gap-1.5">
                  <Label>Percentage</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={d.pct}
                      onChange={(e) => patch({ pct: e.target.value })}
                      className="tabular-nums"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  {pctErr && <div className="text-xs text-destructive">{pctErr}</div>}
                </div>
              )}
              {d.type === "amt" && (
                <div className="grid w-[180px] gap-1.5">
                  <Label>Amount (Rs.)</Label>
                  <Input
                    value={d.amt}
                    onChange={(e) => patch({ amt: e.target.value })}
                    placeholder="0.00"
                    className="tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Applies to — not for free shipping */}
            {canScope && (
              <div className="mt-4 grid gap-1.5">
                <Label>Applies to</Label>
                <Select value={d.applies} onValueChange={(v) => patch({ applies: v as Discount["applies"] })}>
                  <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Entire order</SelectItem>
                    <SelectItem value="categories">Specific categories</SelectItem>
                    <SelectItem value="products">Specific products</SelectItem>
                  </SelectContent>
                </Select>

                {d.applies === "categories" && (
                  <PickerBox
                    search={catSearch}
                    onSearch={setCatSearch}
                    placeholder="Search categories"
                    empty={catRows.length === 0}
                  >
                    {catRows.map((r) => (
                      <label
                        key={r.path}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent"
                        style={{ paddingLeft: 6 + (r.flat ? 0 : r.depth * 16) }}
                      >
                        <Checkbox
                          checked={d.appliesCategories.includes(r.path)}
                          onCheckedChange={() => toggleCat(r.path)}
                        />
                        <span className="min-w-0 truncate text-[13px]">
                          {r.flat && r.path.includes(" > ") ? (
                            <>
                              <span className="text-muted-foreground">
                                {r.path.slice(0, r.path.lastIndexOf(" > ")).replace(/ > /g, " › ")} ›{" "}
                              </span>
                              {r.path.split(" > ").pop()}
                            </>
                          ) : (
                            r.path.split(" > ").pop()
                          )}
                        </span>
                      </label>
                    ))}
                  </PickerBox>
                )}

                {d.applies === "products" && (
                  <PickerBox
                    search={prodSearch}
                    onSearch={setProdSearch}
                    placeholder="Search products"
                    empty={prodRows.length === 0}
                  >
                    {prodRows.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent"
                      >
                        <Checkbox
                          checked={d.appliesProducts.includes(p.id)}
                          onCheckedChange={() => toggleProd(p.id)}
                        />
                        <span className="min-w-0 truncate text-[13px]">{p.title}</span>
                      </label>
                    ))}
                  </PickerBox>
                )}
              </div>
            )}
          </Card>

          {/* Minimum requirements */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Minimum purchase requirements</div>
            <RadioGroup
              value={d.minType}
              onValueChange={(v) => patch({ minType: v as Discount["minType"] })}
              className="gap-2.5"
            >
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <RadioGroupItem value="none" />
                No minimum requirements
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <RadioGroupItem value="amount" />
                Minimum purchase amount (Rs.)
              </label>
              {d.minType === "amount" && (
                <Input
                  value={d.min}
                  onChange={(e) => patch({ min: e.target.value })}
                  placeholder="0.00"
                  className="ml-6 w-[180px] tabular-nums"
                />
              )}
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <RadioGroupItem value="quantity" />
                Minimum quantity of items
              </label>
              {d.minType === "quantity" && (
                <Input
                  value={d.minQty}
                  onChange={(e) => patch({ minQty: e.target.value })}
                  placeholder="0"
                  className="ml-6 w-[120px] tabular-nums"
                />
              )}
            </RadioGroup>
          </Card>

          {/* Usage limits */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Maximum discount uses</div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox
                checked={d.limit !== ""}
                onCheckedChange={(c) => patch({ limit: c === true ? "100" : "" })}
              />
              Limit number of times this can be used in total
            </label>
            {d.limit !== "" && (
              <Input
                value={d.limit}
                onChange={(e) => patch({ limit: e.target.value })}
                className="ml-6 mt-2 w-[140px] tabular-nums"
              />
            )}
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox
                checked={d.onePer}
                onCheckedChange={(c) => patch({ onePer: c === true })}
              />
              Limit to one use per customer
            </label>
          </Card>

          {/* Active dates */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Active dates</div>
            <div className="grid w-[220px] gap-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={d.start}
                onChange={(e) => patch({ start: e.target.value })}
              />
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox
                checked={d.end !== ""}
                onCheckedChange={(c) =>
                  patch({ end: c === true ? d.start : "" })
                }
              />
              Set end date
            </label>
            {d.end !== "" && (
              <div className="mt-2 grid w-[220px] gap-1.5">
                <Input
                  type="date"
                  value={d.end}
                  onChange={(e) => patch({ end: e.target.value })}
                />
              </div>
            )}
          </Card>
        </div>

        {/* Summary rail */}
        <div className="flex flex-col gap-4">
          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">Summary</div>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[status])}>
                {status}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <li>
                {d.code.trim() ? (
                  <>Code <span className="font-mono text-foreground">{d.code.trim()}</span></>
                ) : (
                  "No code yet"
                )}
              </li>
              <li className="text-foreground">{valueLabel}</li>
              <li>Applies to: {appliesLabel}</li>
              <li>{minLabel}</li>
              <li>
                {d.limit !== "" ? `Limited to ${d.limit} uses` : "No usage limit"}
                {d.onePer ? " · one per customer" : ""}
              </li>
              <li>
                Active from {d.start}
                {d.end ? ` until ${d.end}` : ""}
              </li>
            </ul>
          </Card>

          {id && (
            <Card className="gap-0 border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] p-4">
              <div className="mb-2 font-semibold">Danger zone</div>
              <Button
                variant="outline"
                size="sm"
                className="self-start text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete discount
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
              <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={invalid || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes on this page. If you leave now, they'll be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button size="sm" variant="destructive" onClick={() => navigate("/discounts")}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete this discount?</DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={remove}>
              Delete discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PickerBox({
  search,
  onSearch,
  placeholder,
  empty,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1 overflow-hidden rounded-md border">
      <div className="relative border-b">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full bg-transparent pl-[30px] pr-2 text-[13px] outline-none"
        />
      </div>
      <div className="max-h-[200px] overflow-y-auto p-1">
        {empty ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
