import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, X } from "lucide-react";
import { useStore } from "@/state/store-context";
import type { AttributeDef, AttributeValue } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DEFAULT_COLOR = "#1a1a1a";
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function AttributeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { attributes, products, upsertAttribute, deleteAttribute } = useStore();

  const source = id ? attributes.find((a) => a.id === id) : null;

  const initial = useMemo(
    () =>
      source
        ? {
            name: source.name,
            values: source.values.map((v) => ({ ...v })),
            useImages: source.useImages,
            useColor: source.useColor,
          }
        : { name: "", values: [] as AttributeValue[], useImages: false, useColor: false },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  const [name, setName] = useState(initial.name);
  const [values, setValues] = useState<AttributeValue[]>(initial.values);
  const [input, setInput] = useState("");
  const [useImages, setUseImages] = useState(initial.useImages);
  const [useColor, setUseColor] = useState(initial.useColor);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (id && !source) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Attribute not found.
      </Card>
    );
  }

  const touch = () => setDirty(true);

  const nameErr =
    name.trim() &&
    attributes.some(
      (a) => a.id !== id && a.name.toLowerCase() === name.trim().toLowerCase(),
    )
      ? "An attribute with this name already exists."
      : null;
  const invalid = !name.trim() || !!nameErr || values.length === 0;

  const usedByCount = source
    ? products.filter((p) => p.options?.some((o) => o.name === source.name)).length
    : 0;

  const addValue = () => {
    const v = input.trim();
    if (v && !values.some((x) => x.value === v)) {
      setValues([...values, { value: v, color: useColor ? DEFAULT_COLOR : undefined }]);
      touch();
    }
    setInput("");
  };

  const patchValue = (i: number, p: Partial<AttributeValue>) => {
    setValues(values.map((x, xi) => (xi === i ? { ...x, ...p } : x)));
    touch();
  };

  const removeValue = (i: number) => {
    setValues(values.filter((_, xi) => xi !== i));
    touch();
  };

  const toggleUseColor = (on: boolean) => {
    setUseColor(on);
    setValues((vs) =>
      vs.map((v) => ({ ...v, color: on ? (v.color ?? DEFAULT_COLOR) : undefined })),
    );
    touch();
  };

  const back = () => {
    if (dirty) setConfirmDiscard(true);
    else navigate("/products/attributes");
  };

  const save = () => {
    if (invalid) return;
    const rec: AttributeDef = {
      id: id ?? `a${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      values: values.filter((v) => v.value.trim()),
      useImages,
      useColor,
    };
    upsertAttribute(rec);
    setDirty(false);
    toast(id ? "Attribute saved" : "Attribute created");
    navigate("/products/attributes");
  };

  const remove = () => {
    if (usedByCount > 0) {
      toast(`Can't delete — used by ${usedByCount} product${usedByCount > 1 ? "s" : ""}`);
      setConfirmDelete(false);
      return;
    }
    if (id) deleteAttribute(id);
    toast("Attribute deleted");
    navigate("/products/attributes");
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title="Back to attributes"
          onClick={back}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[16px] font-semibold tracking-tight">
          {id ? name.trim() || "Edit attribute" : "New attribute"}
        </h1>
      </div>

      <div className="flex max-w-[760px] flex-col gap-4">
        <Card className="gap-0 p-4">
          <div className="mb-3 font-semibold">Details</div>
          <div className="grid max-w-[320px] gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); touch(); }}
              placeholder="e.g. Size, Color, Flavor"
              className="h-9"
            />
            {nameErr && <div className="text-xs text-destructive">{nameErr}</div>}
          </div>
        </Card>

        <Card className="gap-0 p-4">
          <div className="mb-3 font-semibold">Values</div>

          {useColor ? (
            /* Color mode: one row per value with picker + hex */
            <div className="flex flex-col gap-1.5">
              {values.map((v, i) => {
                const hexOk = !v.color || HEX_RE.test(v.color);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <label
                      className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm"
                      style={{ background: hexOk ? v.color : DEFAULT_COLOR }}
                      title="Pick a color"
                    >
                      <input
                        type="color"
                        value={hexOk && v.color ? v.color : DEFAULT_COLOR}
                        onChange={(e) => patchValue(i, { color: e.target.value })}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <Input
                      value={v.value}
                      onChange={(e) => patchValue(i, { value: e.target.value })}
                      placeholder="Value name"
                      className="h-9 flex-1"
                    />
                    <Input
                      value={v.color ?? ""}
                      onChange={(e) => patchValue(i, { color: e.target.value })}
                      placeholder="#000000"
                      className={`h-9 w-[100px] font-mono text-xs ${hexOk ? "" : "border-destructive"}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeValue(i)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addValue(); }}
                onBlur={addValue}
                placeholder="Type a value + Enter"
                className="h-9 w-full max-w-[320px] rounded-md border border-dashed bg-transparent px-2.5 text-xs outline-none focus:border-ring"
              />
            </div>
          ) : (
            /* Plain mode: chips */
            <div className="flex flex-wrap items-center gap-1.5">
              {values.map((v) => (
                <span
                  key={v.value}
                  className="inline-flex h-[26px] items-center gap-1.5 rounded-md border bg-muted px-2.5 text-xs"
                >
                  {v.value}
                  <button
                    onClick={() => {
                      setValues(values.filter((x) => x.value !== v.value));
                      touch();
                    }}
                    className="flex text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-[11px]" />
                  </button>
                </span>
              ))}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addValue(); }}
                onBlur={addValue}
                placeholder="Type a value + Enter"
                className="h-[26px] w-[140px] rounded-md border border-dashed bg-transparent px-2.5 text-xs outline-none focus:border-ring"
              />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2.5 border-t pt-4">
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <Checkbox
                checked={useColor}
                onCheckedChange={(c) => toggleUseColor(c === true)}
                className="mt-0.5"
              />
              <span>
                Values have colors
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Each value gets a swatch — pick from the color picker or type a
                  hex code. Shown in your store's color selector.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <Checkbox
                checked={useImages}
                onCheckedChange={(c) => { setUseImages(c === true); touch(); }}
                className="mt-0.5"
              />
              <span>
                Values carry photos
                <span className="block text-[11px] font-normal text-muted-foreground">
                  For attributes like Color — each product uploads photos per value.
                </span>
              </span>
            </label>
          </div>
        </Card>

        {id && (
          <Card className="gap-0 border-[color-mix(in_srgb,var(--destructive)_35%,var(--border))] p-4">
            <div className="mb-2 font-semibold">Danger zone</div>
            {usedByCount > 0 && (
              <div className="mb-2 text-xs text-muted-foreground">
                Used by {usedByCount} product{usedByCount > 1 ? "s" : ""} — remove it
                from those products before deleting.
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="self-start text-destructive"
              disabled={usedByCount > 0}
              onClick={() => setConfirmDelete(true)}
            >
              Delete attribute
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
              onClick={() => navigate("/products/attributes")}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete "{name.trim() || "this attribute"}"?</DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={remove}>
              Delete attribute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
