import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Image as ImageIcon, Plus, Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import type { Category } from "@/lib/mock-data";
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
import { PageHeader } from "@/components/page-header";

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

type Sort = "tree" | "name-asc" | "name-desc" | "count-desc" | "count-asc";

interface Row {
  cat: Category;
  depth: number;
  hasKids: boolean;
  flat: boolean;
}

export function CategoriesTab() {
  const { categories, products, deleteCategory } = useStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Tops: true,
    "Tops > T-Shirts": true,
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("tree");

  const byPath = new Map<string, Category>();
  for (const c of categories) byPath.set(c.path, c);

  const leaf = (path: string) => path.split(" > ").pop() ?? path;
  const countNum = (path: string) =>
    products.filter(
      (x) => x.cats.includes(path) || x.cats.some((cc) => cc.startsWith(`${path} > `)),
    ).length;
  const countLabel = (path: string) => {
    const own = products.filter((x) => x.cats.includes(path)).length;
    const desc = products.filter((x) => x.cats.some((cc) => cc.startsWith(`${path} > `))).length;
    return own + (desc ? ` (+${desc})` : "");
  };

  const q = search.trim().toLowerCase();
  const flatMode = q.length > 0 || sort !== "tree";

  let rows: Row[] = [];
  if (flatMode) {
    let list = categories.filter(
      (c) => !q || c.path.toLowerCase().includes(q) || c.slug.includes(q),
    );
    const cmp: Record<Exclude<Sort, "tree">, (a: Category, b: Category) => number> = {
      "name-asc": (a, b) => leaf(a.path).localeCompare(leaf(b.path)),
      "name-desc": (a, b) => leaf(b.path).localeCompare(leaf(a.path)),
      "count-desc": (a, b) => countNum(b.path) - countNum(a.path),
      "count-asc": (a, b) => countNum(a.path) - countNum(b.path),
    };
    list = [...list].sort(cmp[sort === "tree" ? "name-asc" : sort]);
    rows = list.map((cat) => ({ cat, depth: 0, hasKids: false, flat: true }));
  } else {
    const walk = (path: string) => {
      const cat = byPath.get(path);
      if (!cat) return;
      const depth = path.split(" > ").length - 1;
      const kids = categories.filter(
        (c) => c.path.startsWith(`${path} > `) && c.path.split(" > ").length === depth + 2,
      );
      rows.push({ cat, depth, hasKids: kids.length > 0, flat: false });
      if (expanded[path]) kids.forEach((k) => walk(k.path));
    };
    categories.filter((c) => !c.path.includes(" > ")).forEach((c) => walk(c.path));
  }

  const editHref = (path: string) =>
    `/products/categories/edit/${encodeURIComponent(path)}`;

  const selectedPaths = Object.keys(selected).filter((p) => selected[p]);
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.cat.path]);

  const bulkDelete = () => {
    [...selectedPaths]
      .sort((a, b) => b.split(" > ").length - a.split(" > ").length)
      .forEach((p) => deleteCategory(p));
    toast(`${selectedPaths.length} categor${selectedPaths.length === 1 ? "y" : "ies"} deleted`);
    setSelected({});
    setConfirmDelete(false);
  };

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group your products for the storefront menu. Up to 3 levels deep."
      >
        <Button size="sm" onClick={() => navigate("/products/categories/new")}>
          <Plus className="size-3.5" />
          Add category
        </Button>
      </PageHeader>

      {/* Search + sort */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug"
            className="h-9 pl-[30px]"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tree">Tree order</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
            <SelectItem value="count-desc">Most products</SelectItem>
            <SelectItem value="count-asc">Fewest products</SelectItem>
          </SelectContent>
        </Select>
        {selectedPaths.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedPaths.length} selected
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
                      if (c === true) for (const r of rows) next[r.cat.path] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className="w-12" />
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Description</TableHead>
                <TableHead className={cn(HEAD, "w-[150px]")}>Slug</TableHead>
                <TableHead className={cn(HEAD, "w-16 text-right")}>Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const parentPath = r.cat.path.includes(" > ")
                  ? r.cat.path.slice(0, r.cat.path.lastIndexOf(" > "))
                  : "";
                return (
                  <TableRow
                    key={r.cat.path}
                    data-state={selected[r.cat.path] ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={!!selected[r.cat.path]}
                        onCheckedChange={(c) =>
                          setSelected((s) => ({ ...s, [r.cat.path]: c === true }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(editHref(r.cat.path))}
                        className={
                          r.cat.hasCover
                            ? "size-10 rounded-md border"
                            : "flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground"
                        }
                        style={
                          r.cat.hasCover
                            ? {
                                background:
                                  "repeating-linear-gradient(45deg, var(--muted), var(--muted) 5px, var(--background) 5px, var(--background) 10px)",
                              }
                            : undefined
                        }
                      >
                        {!r.cat.hasCover && <ImageIcon className="size-4" />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex min-w-0 items-center gap-1.5"
                        style={{ paddingLeft: r.flat ? 0 : r.depth * 20 }}
                      >
                        {!r.flat && r.hasKids ? (
                          <button
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [r.cat.path]: !e[r.cat.path] }))
                            }
                            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                          >
                            <ChevronRight
                              className={cn(
                                "size-[13px] transition-transform duration-100",
                                expanded[r.cat.path] && "rotate-90",
                              )}
                            />
                          </button>
                        ) : (
                          !r.flat && <span className="w-5 shrink-0" />
                        )}
                        <button
                          onClick={() => navigate(editHref(r.cat.path))}
                          className="min-w-0 truncate text-left hover:underline"
                        >
                          {r.flat && parentPath && (
                            <span className="text-muted-foreground">
                              {parentPath.replace(/ > /g, " › ")} ›{" "}
                            </span>
                          )}
                          <span className="font-medium">{leaf(r.cat.path)}</span>
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {r.cat.description || "—"}
                    </TableCell>
                    <TableCell className="truncate font-mono text-xs text-muted-foreground">
                      /{r.cat.slug}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {countLabel(r.cat.path)}
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
            {q ? "No categories match your search." : "Add your first category."}
          </div>
        </Card>
      )}

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedPaths.length} categor
              {selectedPaths.length === 1 ? "y" : "ies"}?
            </DialogTitle>
            <DialogDescription>
              Child categories that aren't selected move up one level. Products
              keep their other categories.
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
    </>
  );
}
