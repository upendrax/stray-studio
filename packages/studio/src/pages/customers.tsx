import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import { money, rel } from "@/lib/format";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

export default function Customers() {
  const { customers, customersLoading, anonymizeCustomer } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = search.toLowerCase();
  const filtered = customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")),
  );

  // Customers are keyed by email (guests have no account id).
  const selectedEmails = Object.keys(selected).filter((e) => selected[e]);
  const allSelected =
    filtered.length > 0 && filtered.every((c) => selected[c.email]);

  const bulkDelete = async () => {
    setBusy(true);
    try {
      for (const email of selectedEmails) await anonymizeCustomer(email);
      toast(
        `${selectedEmails.length} customer${selectedEmails.length === 1 ? "" : "s"} deleted — orders anonymized`,
      );
      setSelected({});
      setConfirmDelete(false);
    } catch {
      toast("Couldn't delete — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone who has shopped with you."
      />
      <div className="mb-3 flex gap-2">
        <div className="relative w-[280px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone"
            className="h-9 pl-[30px]"
          />
        </div>
        {selectedEmails.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedEmails.length} selected
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

      {customersLoading ? (
        <Card className="flex items-center justify-center px-6 py-12 text-muted-foreground shadow-sm">
          <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </Card>
      ) : filtered.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(c) => {
                      const next: Record<string, boolean> = {};
                      if (c === true) for (const cu of filtered) next[cu.email] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Email</TableHead>
                <TableHead className={cn(HEAD, "w-32")}>Phone</TableHead>
                <TableHead className={cn(HEAD, "w-16 text-right")}>Orders</TableHead>
                <TableHead className={cn(HEAD, "w-28 text-right")}>Total spent</TableHead>
                <TableHead className={cn(HEAD, "w-24 text-right")}>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.email}
                  onClick={() => navigate(`/customers/${encodeURIComponent(c.email)}`)}
                  data-state={selected[c.email] ? "selected" : undefined}
                  className="cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!selected[c.email]}
                      onCheckedChange={(ch) => setSelected((s) => ({ ...s, [c.email]: ch === true }))}
                    />
                  </TableCell>
                  <TableCell className="truncate font-medium">
                    {c.name}
                    {c.guest && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        Guest
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{c.phone}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(c.spent)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {rel(c.joinedMin)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2.5 text-xs text-muted-foreground">
            Showing 1–{filtered.length} of {filtered.length}
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-12 text-center shadow-sm">
          <div className="text-muted-foreground">
            {customers.length === 0
              ? "Customers appear here after their first order."
              : "No customers match this search."}
          </div>
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedEmails.length} customer{selectedEmails.length > 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              Their accounts are removed. Orders are kept and anonymized. This
              can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
