import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Images, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/state/store-context";
import type { AttributeDef } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

// Shared header-cell style: compact uppercase muted label (used across all tables).
const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

type Sort = "name-asc" | "name-desc" | "used-desc" | "used-asc";

export default function Attributes() {
  const { attributes, products, deleteAttribute } = useStore();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name-asc");

  const usedByCount = (attr: AttributeDef) =>
    products.filter((p) => p.options?.some((o) => o.name === attr.name)).length;

  const q = search.trim().toLowerCase();
  const filtered = attributes.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.values.some((v) => v.value.toLowerCase().includes(q)),
  );
  const cmp: Record<Sort, (a: AttributeDef, b: AttributeDef) => number> = {
    "name-asc": (a, b) => a.name.localeCompare(b.name),
    "name-desc": (a, b) => b.name.localeCompare(a.name),
    "used-desc": (a, b) => usedByCount(b) - usedByCount(a),
    "used-asc": (a, b) => usedByCount(a) - usedByCount(b),
  };
  const rows = [...filtered].sort(cmp[sort]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected = rows.length > 0 && rows.every((a) => selected[a.id]);

  const bulkDelete = () => {
    const chosen = attributes.filter((a) => selected[a.id]);
    const unused = chosen.filter((a) => usedByCount(a) === 0);
    unused.forEach((a) => deleteAttribute(a.id));
    const skipped = chosen.length - unused.length;
    toast(
      `${unused.length} attribute${unused.length === 1 ? "" : "s"} deleted` +
        (skipped > 0 ? ` — ${skipped} skipped (in use)` : ""),
    );
    setSelected({});
    setConfirmDelete(false);
  };

  return (
    <div>
      <PageHeader
        title="Attributes"
        description="The options products can have (Size, Color…). Products pick which values apply, so storefront filters always group correctly."
      >
        <Button size="sm" onClick={() => navigate("/products/attributes/new")}>
          <Plus className="size-3.5" />
          New attribute
        </Button>
      </PageHeader>

      {/* Search + sort */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or value"
            className="h-9 pl-[30px]"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
            <SelectItem value="used-desc">Most used</SelectItem>
            <SelectItem value="used-asc">Least used</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {rows.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => {
                      const next: Record<string, boolean> = {};
                      if (c === true) for (const a of rows) next[a.id] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className="w-12" />
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Values</TableHead>
                <TableHead className={cn(HEAD, "w-20 text-right")}>Products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((attr) => {
                const shown = attr.values.slice(0, 6);
                const extra = attr.values.length - shown.length;
                return (
                  <TableRow
                    key={attr.id}
                    data-state={selected[attr.id] ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={!!selected[attr.id]}
                        onCheckedChange={(c) =>
                          setSelected((s) => ({ ...s, [attr.id]: c === true }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/products/attributes/edit/${attr.id}`)}
                        className="flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground"
                      >
                        <SlidersHorizontal className="size-4" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          onClick={() => navigate(`/products/attributes/edit/${attr.id}`)}
                          className="truncate font-medium hover:underline"
                        >
                          {attr.name}
                        </button>
                        {attr.useImages && (
                          <Badge variant="outline" className="gap-1 text-[10px] font-normal text-muted-foreground">
                            <Images className="size-[10px]" />
                            photos
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                        {shown.map((v) => (
                          <Badge
                            key={v.value}
                            variant="secondary"
                            className="gap-1 rounded-md font-normal"
                          >
                            {attr.useColor && v.color && (
                              <span className="size-2.5 rounded-full border" style={{ background: v.color }} />
                            )}
                            {v.value}
                          </Badge>
                        ))}
                        {extra > 0 && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">+{extra}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {usedByCount(attr)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2.5 text-xs text-muted-foreground">
            Showing 1–{rows.length} of {rows.length}
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-12 text-center shadow-sm">
          <div className="text-muted-foreground">
            {q
              ? "No attributes match your search."
              : "Create your first attribute — e.g. Size with S, M, L."}
          </div>
        </Card>
      )}

      {/* Bulk delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.length} attribute{selectedIds.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              Attributes still used by a product are skipped. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
