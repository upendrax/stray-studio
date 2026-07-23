import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FolderPlus, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/state/store-context";
import { moneyShort, rel } from "@/lib/format";
import { summaryStock, type ProductSummary, type StockLevel } from "@/lib/mock-data";
import { StockDot } from "@/components/stock-dot";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

function inventoryLabel(p: ProductSummary): string {
  if (!p.hasOptions) {
    if (!p.trackInventory) return "Not tracked";
    if (p.totalStock <= 0) return "Out of stock";
    if (p.totalStock <= p.lowStockThreshold) return `${p.totalStock} in stock — low`;
    return `${p.totalStock} in stock`;
  }
  const lvl = summaryStock(p);
  const suffix = lvl === "low" ? " — low" : lvl === "out" ? " — out" : "";
  return `${p.variantCount} variant${p.variantCount === 1 ? "" : "s"} · ${p.totalStock} in stock${suffix}`;
}

// Summaries carry only the base price (per-variant prices live on the full
// product), so the list shows the base — the price for inheriting variants.
function priceLabel(p: ProductSummary): string {
  return moneyShort(p.basePrice / 100);
}

export default function Products() {
  const { productSummaries, productsLoading, bulkProducts, categories } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "Active" | "Draft">("all");
  const [stock, setStock] = useState<"all" | StockLevel>(
    (params.get("stock") as StockLevel) ?? "all",
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = search.toLowerCase();
  const filtered = productSummaries.filter(
    (p) =>
      (!q || p.title.toLowerCase().includes(q) || p.slug.includes(q)) &&
      (status === "all" || p.status === status.toLowerCase()) &&
      (stock === "all" || summaryStock(p) === stock),
  );

  const bulkIds = Object.keys(selected).filter((id) => selected[id]);
  const firstRun = productSummaries.length === 0;

  const runBulk = async (
    fn: () => Promise<void>,
    done: string,
    close?: () => void,
  ) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      setSelected({});
      close?.();
    } catch {
      toast("Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  };

  const setStatusBulk = (st: "Active" | "Draft") =>
    runBulk(
      () => bulkProducts("status", bulkIds, { status: st }),
      `${bulkIds.length} product${bulkIds.length > 1 ? "s" : ""} set to ${st}`,
    );

  const deleteBulk = () =>
    runBulk(() => bulkProducts("delete", bulkIds), "Products deleted", () =>
      setConfirmDelete(false),
    );

  const addToCategory = (cat: { id?: string; path: string }) => {
    if (!cat.id) return;
    runBulk(
      () => bulkProducts("addCategory", bulkIds, { categoryId: cat.id }),
      `Added ${bulkIds.length} product${bulkIds.length > 1 ? "s" : ""} to ${cat.path
        .split(" > ")
        .pop()}`,
    );
  };

  return (
    <div>
      <PageHeader title="Products" description="Your catalog — everything you sell.">
        <Button size="sm" asChild>
          <Link to="/products/new">
            <Plus className="size-3.5" />
            Add product
          </Link>
        </Button>
      </PageHeader>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
            className="h-9 pl-[30px]"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stock} onValueChange={(v) => setStock(v as typeof stock)}>
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stock level</SelectItem>
            <SelectItem value="ok">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        {bulkIds.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {bulkIds.length} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderPlus className="size-3.5" />
                  Add to category
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
                {categories.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No categories yet.
                  </div>
                ) : (
                  categories.map((c) => (
                    <DropdownMenuItem key={c.path} onClick={() => addToCategory(c)}>
                      {c.path}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatusBulk("Active")}>
              Set Active
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatusBulk("Draft")}>
              Set Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {productsLoading ? (
        <Card className="flex items-center justify-center px-6 py-12 text-muted-foreground shadow-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </Card>
      ) : filtered.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((p) => selected[p.id])}
                    onCheckedChange={(c) => {
                      const next: Record<string, boolean> = {};
                      if (c === true) for (const p of filtered) next[p.id] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className="w-12" />
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={cn(HEAD, "w-20")}>Status</TableHead>
                <TableHead className={cn(HEAD, "w-[200px]")}>Inventory</TableHead>
                <TableHead className={cn(HEAD, "w-[130px] text-right")}>Price</TableHead>
                <TableHead className={cn(HEAD, "w-24 text-right")}>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const lvl = summaryStock(p);
                return (
                  <TableRow key={p.id} data-state={selected[p.id] ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={!!selected[p.id]}
                        onCheckedChange={(c) =>
                          setSelected((s) => ({ ...s, [p.id]: c === true }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/products/${p.id}`)}
                        className="flex size-10 items-center justify-center rounded-md border bg-muted text-[10px] font-semibold text-muted-foreground"
                      >
                        {p.title.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/products/${p.id}`)}
                        className="truncate text-left font-medium hover:underline"
                      >
                        {p.title}
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-[11px]",
                          p.status === "active"
                            ? "bg-status-delivered-bg text-status-delivered-fg"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {p.status === "active" ? "Active" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <StockDot level={lvl} />
                        <span className="text-xs text-muted-foreground">{inventoryLabel(p)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{priceLabel(p)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {rel(Math.max(0, Math.round((Date.now() - p.updatedAt) / 60000)))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2.5 text-xs text-muted-foreground">
            Showing 1–{filtered.length} of {filtered.length}
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-12 text-center shadow-sm">
          <div className="mb-3 text-muted-foreground">
            {firstRun
              ? "Add your first product to start selling."
              : "No products match these filters."}
          </div>
          {firstRun && (
            <Button size="sm" onClick={() => navigate("/products/new")} className="mx-auto">
              Add your first product
            </Button>
          )}
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Delete {bulkIds.length} product{bulkIds.length > 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={deleteBulk} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
