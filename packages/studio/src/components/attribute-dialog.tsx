import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AttributeDef, AttributeValue } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  initial: AttributeDef | null; // null = create
  existingNames: string[]; // for uniqueness check (excluding the edited one)
  onClose: () => void;
  onSave: (rec: Omit<AttributeDef, "id">) => void;
}

const DEFAULT_COLOR = "#1a1a1a";
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function AttributeDialog({ open, initial, existingNames, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [values, setValues] = useState<AttributeValue[]>([]);
  const [input, setInput] = useState("");
  const [useImages, setUseImages] = useState(false);
  const [useColor, setUseColor] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setValues(initial?.values.map((v) => ({ ...v })) ?? []);
      setUseImages(initial?.useImages ?? false);
      setUseColor(initial?.useColor ?? false);
      setInput("");
    }
  }, [open, initial]);

  const nameErr =
    name.trim() &&
    existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())
      ? "An attribute with this name already exists."
      : null;
  const invalid = !name.trim() || !!nameErr || values.length === 0;

  const addValue = () => {
    const v = input.trim();
    if (v && !values.some((x) => x.value === v))
      setValues([...values, { value: v, color: useColor ? DEFAULT_COLOR : undefined }]);
    setInput("");
  };

  const patchValue = (i: number, patch: Partial<AttributeValue>) =>
    setValues(values.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));

  const toggleUseColor = (on: boolean) => {
    setUseColor(on);
    setValues((vs) =>
      vs.map((v) => ({ ...v, color: on ? (v.color ?? DEFAULT_COLOR) : undefined })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[420px]">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit attribute" : "New attribute"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Size, Color, Flavor"
              className="h-9"
            />
            {nameErr && <div className="text-xs text-destructive">{nameErr}</div>}
          </div>

          <div className="grid gap-1.5">
            <Label>Values</Label>
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
                        onClick={() => setValues(values.filter((_, xi) => xi !== i))}
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
                  className="h-9 w-full rounded-md border border-dashed bg-transparent px-2.5 text-xs outline-none focus:border-ring"
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
                      onClick={() => setValues(values.filter((x) => x.value !== v.value))}
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
          </div>

          <label className="mt-1 flex cursor-pointer items-start gap-2 text-[13px]">
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
              onCheckedChange={(c) => setUseImages(c === true)}
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
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={invalid}
            onClick={() => {
              onSave({
                name: name.trim(),
                values: values.filter((v) => v.value.trim()),
                useImages,
                useColor,
              });
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
