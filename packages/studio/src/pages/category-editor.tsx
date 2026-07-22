import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { useStore } from "@/state/store-context";
import { makeCategory, pathSlug, slugify, type Category } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const NO_PARENT = "__none";

interface Draft {
  name: string;
  parent: string; // "" = top level
  description: string;
  hasCover: boolean;
  slug: string;
  slugTouched: boolean;
  metaTitle: string;
  metaDesc: string;
}

function draftFrom(cat: Category): Draft {
  const seg = cat.path.split(" > ");
  return {
    name: seg[seg.length - 1] ?? "",
    parent: seg.slice(0, -1).join(" > "),
    description: cat.description,
    hasCover: cat.hasCover,
    slug: cat.slug,
    slugTouched: true,
    metaTitle: cat.metaTitle,
    metaDesc: cat.metaDesc,
  };
}

const blank: Draft = {
  name: "",
  parent: "",
  description: "",
  hasCover: false,
  slug: "",
  slugTouched: false,
  metaTitle: "",
  metaDesc: "",
};

export default function CategoryEditor() {
  const { path: encoded } = useParams();
  const navigate = useNavigate();
  const { categories, upsertCategory, deleteCategory } = useStore();

  const originalPath = encoded ? decodeURIComponent(encoded) : null;
  const source = originalPath
    ? categories.find((c) => c.path === originalPath)
    : null;

  const initial = useMemo(
    () => (source ? draftFrom(source) : blank),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [encoded],
  );
  const [d, setD] = useState<Draft>(initial);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (originalPath && !source) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Category not found.
      </Card>
    );
  }

  const patch = (p: Partial<Draft>) => {
    setD((s) => ({ ...s, ...p }));
    setDirty(true);
  };

  const newPath = (d.parent ? `${d.parent} > ` : "") + d.name.trim();
  const nameErr =
    d.name.trim() &&
    categories.some((c) => c.path === newPath && newPath !== originalPath)
      ? "A category with this name already exists here."
      : null;
  const invalid = !d.name.trim() || !!nameErr;

  const previewSlug =
    d.slugTouched && d.slug.trim() ? d.slug.trim() : pathSlug(newPath || d.name.trim());

  const back = () => {
    if (dirty) setConfirmDiscard(true);
    else navigate("/products/categories");
  };

  const save = () => {
    if (invalid) return;
    upsertCategory(
      makeCategory(newPath, {
        description: d.description.trim(),
        hasCover: d.hasCover,
        slug: d.slugTouched && d.slug.trim() ? d.slug.trim() : pathSlug(newPath),
        metaTitle: d.metaTitle.trim(),
        metaDesc: d.metaDesc.trim(),
      }),
      originalPath ?? undefined,
    );
    setDirty(false);
    toast(originalPath ? "Category saved" : "Category created");
    navigate("/products/categories");
  };

  const remove = () => {
    if (originalPath) deleteCategory(originalPath);
    toast("Category deleted");
    navigate("/products/categories");
  };

  return (
    <div>
      {/* Header with back navigation */}
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title="Back to categories"
          onClick={back}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[16px] font-semibold tracking-tight">
          {originalPath ? d.name.trim() || "Edit category" : "New category"}
        </h1>
      </div>

      <div className="flex max-w-[760px] flex-col gap-4">
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Details</div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={d.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. T-Shirts"
                className="h-9"
              />
              {nameErr && <div className="text-xs text-destructive">{nameErr}</div>}
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label>Parent category</Label>
              <Select
                value={d.parent || NO_PARENT}
                onValueChange={(v) => patch({ parent: v === NO_PARENT ? "" : v })}
              >
                <SelectTrigger className="h-9 w-full sm:w-[280px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>None (top level)</SelectItem>
                  {categories
                    .filter(
                      (c) =>
                        !(
                          originalPath &&
                          (c.path === originalPath ||
                            c.path.startsWith(`${originalPath} > `))
                        ),
                    )
                    .map((c) => (
                      <SelectItem
                        key={c.path}
                        value={c.path}
                        disabled={c.path.split(" > ").length >= 3}
                      >
                        {c.path}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                Categories can go 3 levels deep, so grandchildren can't be parents.
              </div>
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={d.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="A short intro shown at the top of the category page…"
                className="h-24 resize-y"
              />
            </div>
          </Card>

          {/* Cover image */}
          <Card className="gap-0 p-4">
            <div className="font-semibold">Cover image</div>
            <div className="mb-3 text-xs text-muted-foreground">
              A banner shown at the top of this category's page in your store. Optional.
            </div>
            <button
              onClick={() => patch({ hasCover: !d.hasCover })}
              className={
                "flex h-40 w-full items-center justify-center overflow-hidden rounded-md border text-muted-foreground " +
                (d.hasCover ? "" : "border-dashed hover:border-ring")
              }
              style={
                d.hasCover
                  ? {
                      background:
                        "repeating-linear-gradient(45deg, var(--muted), var(--muted) 8px, var(--background) 8px, var(--background) 16px)",
                    }
                  : undefined
              }
            >
              {!d.hasCover && (
                <span className="flex flex-col items-center gap-1">
                  <ImagePlus className="size-5" />
                  <span className="text-[11px]">Add image</span>
                </span>
              )}
            </button>
          </Card>

          {/* SEO */}
          <Card className="gap-0 p-4">
            <div className="mb-3 font-semibold">Search engine listing</div>
            <div className="grid gap-1.5">
              <Label>URL handle</Label>
              <div className="flex items-center gap-1 rounded-md border border-input px-2 text-xs text-muted-foreground">
                <span className="shrink-0">/</span>
                <input
                  value={previewSlug}
                  onChange={(e) =>
                    patch({ slug: slugPath(e.target.value), slugTouched: true })
                  }
                  className="h-9 w-full bg-transparent font-mono outline-none"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label>Meta title</Label>
              <Input
                value={d.metaTitle}
                onChange={(e) => patch({ metaTitle: e.target.value })}
                placeholder={d.name || "Category page title"}
                className="h-9"
              />
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label>Meta description</Label>
              <Textarea
                value={d.metaDesc}
                onChange={(e) => patch({ metaDesc: e.target.value })}
                placeholder="Shown in search results…"
                className="h-16 resize-none"
              />
            </div>
          </Card>

          {originalPath && (
            <Card className="gap-0 border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] p-4">
              <div className="mb-2 font-semibold">Danger zone</div>
              <Button
                variant="outline"
                size="sm"
                className="self-start text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete category
              </Button>
            </Card>
          )}
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
              <Button size="sm" onClick={save} disabled={invalid}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Discard confirm */}
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes on this page. If you leave now, they'll
              be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => navigate("/products/categories")}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete "{d.name.trim() || "this category"}"?</DialogTitle>
            <DialogDescription>
              Child categories move up one level — nothing is deleted in
              cascade. Products keep their other categories.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={remove}>
              Delete category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function slugPath(s: string): string {
  return s
    .split("/")
    .map((seg) => slugify(seg))
    .filter(Boolean)
    .join("/");
}
