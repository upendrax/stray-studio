import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import {
  discountStatus,
  discountTypeLabel,
  type DiscountStatus,
} from "@/lib/mock-data";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

const STATUS_BADGE: Record<DiscountStatus, string> = {
  Active: "bg-status-delivered-bg text-status-delivered-fg",
  Scheduled: "bg-status-paid-bg text-status-paid-fg",
  Expired: "bg-status-cancelled-bg text-status-cancelled-fg",
  Disabled: "bg-status-cancelled-bg text-status-cancelled-fg",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function endsLabel(iso: string): string {
  if (!iso) return "No end date";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Discounts() {
  const { discounts, upsertDiscount, deleteDiscounts } = useStore();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const rows = discounts.filter((d) => !q || d.code.toLowerCase().includes(q));

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected = rows.length > 0 && rows.every((d) => selected[d.id]);

  const editHref = (id: string) => `/discounts/edit/${id}`;

  const copyCode = (code: string) => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    toast("Code copied");
  };

  const bulkSetEnabled = (enabled: boolean) => {
    for (const d of discounts) if (selected[d.id]) upsertDiscount({ ...d, enabled });
    toast(`${selectedIds.length} discount${selectedIds.length === 1 ? "" : "s"} ${enabled ? "enabled" : "disabled"}`);
    setSelected({});
  };

  const bulkDelete = () => {
    deleteDiscounts(selectedIds);
    toast("Discounts deleted");
    setSelected({});
    setConfirmDelete(false);
  };

  return (
    <div>
      <PageHeader title="Discounts" description="Codes and automatic offers customers get at checkout.">
        <Button size="sm" onClick={() => navigate("/discounts/new")}>
          Create discount
        </Button>
      </PageHeader>

      {/* Search + bulk */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code"
            className="h-9 pl-[30px]"
          />
        </div>
        {selectedIds.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            <Button variant="outline" size="sm" onClick={() => bulkSetEnabled(true)}>
              Enable
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkSetEnabled(false)}>
              Disable
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
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
                      if (c === true) for (const d of rows) next[d.id] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className={HEAD}>Code</TableHead>
                <TableHead className={cn(HEAD, "w-32")}>Type</TableHead>
                <TableHead className={cn(HEAD, "w-24")}>Usage</TableHead>
                <TableHead className={cn(HEAD, "w-24")}>Status</TableHead>
                <TableHead className={cn(HEAD, "w-32")}>Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => {
                const st = discountStatus(d);
                return (
                  <TableRow
                    key={d.id}
                    onClick={() => navigate(editHref(d.id))}
                    data-state={selected[d.id] ? "selected" : undefined}
                    className="cursor-pointer"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={!!selected[d.id]}
                        onCheckedChange={(c) => setSelected((s) => ({ ...s, [d.id]: c === true }))}
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          copyCode(d.code);
                        }}
                        title="Click to copy"
                        className="inline-flex cursor-copy items-center gap-1.5 font-mono text-xs font-semibold"
                      >
                        {d.code}
                        <Copy className="size-[11px] text-muted-foreground" />
                      </span>
                    </TableCell>
                    <TableCell>{discountTypeLabel(d)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {d.uses} / {d.limit || "∞"}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[11px]", STATUS_BADGE[st])}>{st}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{endsLabel(d.end)}</TableCell>
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
          <div className="mb-3 text-muted-foreground">
            {q ? "No discounts match your search." : "Create your first discount code."}
          </div>
          {!q && (
            <Button size="sm" className="mx-auto" onClick={() => navigate("/discounts/new")}>
              Create discount
            </Button>
          )}
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.length} discount{selectedIds.length > 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
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
