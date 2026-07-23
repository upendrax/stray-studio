import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, MoreHorizontal } from "lucide-react";
import { useStore } from "@/state/store-context";
import { ApiError } from "@/lib/api";
import type { CustomerDetail } from "@/lib/mock-data";
import { money, rel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

export default function CustomerDetail() {
  const { email } = useParams();
  const navigate = useNavigate();
  const { getCustomer, anonymizeCustomer } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    setLoading(true);
    getCustomer(email)
      .then((cust) => {
        if (alive) setC(cust);
      })
      .catch(() => {
        if (alive) setNotFound(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [email, getCustomer]);

  if (notFound) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Customer not found.
      </Card>
    );
  }
  if (loading || !c) {
    return (
      <Card className="flex items-center justify-center px-6 py-16 text-muted-foreground shadow-sm">
        <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </Card>
    );
  }
  const custOrders = c.orders;

  const tiles = [
    { label: "Orders", value: String(c.count) },
    { label: "Total spent", value: money(c.spent) },
    { label: "Average order", value: money(c.countSpend ? c.spent / c.countSpend : 0) },
  ];

  const doDelete = async () => {
    try {
      await anonymizeCustomer(c.email);
      toast("Customer deleted — orders anonymized");
      navigate("/customers");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete customer");
      setConfirmDelete(false);
    }
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    toast(`${label} copied`);
  };

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          title="Back to customers"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="text-[16px] font-semibold tracking-tight">
            {c.name}
            {c.guest && (
              <span className="ml-2 align-middle rounded-full border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                Guest
              </span>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete customer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="mt-0.5 whitespace-nowrap text-[19px] font-semibold tabular-nums">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3 font-semibold">Orders</div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={cn(HEAD, "w-16")}>Order</TableHead>
                <TableHead className={HEAD}>Date</TableHead>
                <TableHead className={cn(HEAD, "w-28 text-right")}>Total</TableHead>
                <TableHead className={cn(HEAD, "w-24")}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {custOrders.map((o) => (
                <TableRow
                  key={o.num}
                  onClick={() => navigate(`/orders/${o.num}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium tabular-nums">#{o.num}</TableCell>
                  <TableCell className="truncate text-muted-foreground">{rel(o.min)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(o.total)}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Contact</div>
            <div className="flex flex-col gap-0.5">
              <div className="group flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{c.email}</span>
                <button
                  onClick={() => copy(c.email, "Email")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Copy email"
                >
                  <Copy className="size-3" />
                </button>
              </div>
              <div className="group flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{c.phone}</span>
                <button
                  onClick={() => copy(c.phone, "Phone")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Copy phone"
                >
                  <Copy className="size-3" />
                </button>
              </div>
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Joined {rel(c.joinedMin)}
            </div>
          </Card>

          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Addresses</div>
            <div className="whitespace-pre-line border-b py-2 text-xs text-muted-foreground">
              {c.address}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Read-only — customers manage their own addresses.
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete "{c.name}"?</DialogTitle>
            <DialogDescription>
              Their account is removed. Orders are kept and anonymized. This
              can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={doDelete}>
              Delete customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
