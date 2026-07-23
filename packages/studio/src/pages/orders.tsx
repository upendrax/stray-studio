import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useStore } from "@/state/store-context";
import { Checkbox } from "@/components/ui/checkbox";
import { money, rel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/mock-data";

const TABS = ["All", "Pending", "Paid", "Shipped", "Delivered", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

const PAY_LABELS: Record<PaymentMethod, string> = {
  payhere: "PayHere",
  bank: "Bank transfer",
};

const HEAD = "text-[11px] uppercase tracking-wider text-muted-foreground";

export default function Orders() {
  const { orders, ordersLoading, setOrderStatus } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) ?? "All";
  const [search, setSearch] = useState("");
  const [pay, setPay] = useState<"all" | PaymentMethod>("all");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { All: orders.length, Pending: 0, Paid: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
    for (const o of orders) {
      const key = o.status === "Refunded" ? "Cancelled" : (o.status as Tab);
      if (key in c && key !== "All") c[key]++;
    }
    return c;
  }, [orders]);

  const q = search.toLowerCase();
  const filtered = orders.filter(
    (o) =>
      (tab === "All" || o.status === tab || (tab === "Cancelled" && o.status === "Refunded")) &&
      (pay === "all" || o.pay === pay) &&
      (!q ||
        `#${o.num}`.includes(q) ||
        o.cust.toLowerCase().includes(q) ||
        o.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
  );

  const firstRun = orders.length === 0;
  const selectedNums = Object.keys(selected)
    .filter((k) => selected[Number(k)])
    .map(Number);
  const allSelected =
    filtered.length > 0 && filtered.every((o) => selected[o.num]);

  const bulkAdvance = async (from: "Paid" | "Shipped", to: "Shipped" | "Delivered") => {
    const eligible = orders.filter((o) => selectedNums.includes(o.num) && o.status === from);
    setBusy(true);
    try {
      for (const o of eligible)
        await setOrderStatus(o.num, to.toLowerCase(), { message: `Marked as ${to.toLowerCase()}` });
      const skipped = selectedNums.length - eligible.length;
      toast(
        `${eligible.length} order${eligible.length === 1 ? "" : "s"} marked as ${to.toLowerCase()}` +
          (skipped > 0 ? ` — ${skipped} skipped (not ${from})` : ""),
      );
      setSelected({});
    } catch {
      toast("Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Track, fulfil and manage customer orders."
      />
      {/* Search + filters */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone"
            className="h-9 pl-[30px]"
          />
        </div>
        <Select
          value={tab}
          onValueChange={(v) => setParams(v === "All" ? {} : { tab: v })}
        >
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABS.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "All" ? "All statuses" : t}
                <span className="text-muted-foreground tabular-nums">
                  ({counts[t]})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pay} onValueChange={(v) => setPay(v as typeof pay)}>
          <SelectTrigger className="h-9 w-auto gap-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment methods</SelectItem>
            <SelectItem value="payhere">PayHere</SelectItem>
            <SelectItem value="bank">Bank transfer</SelectItem>
          </SelectContent>
        </Select>
        {selectedNums.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {selectedNums.length} selected
            </span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => bulkAdvance("Paid", "Shipped")}>
              Mark as shipped
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => bulkAdvance("Shipped", "Delivered")}>
              Mark as delivered
            </Button>
          </div>
        )}
      </div>

      {ordersLoading ? (
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
                    checked={allSelected}
                    onCheckedChange={(c) => {
                      const next: Record<number, boolean> = {};
                      if (c === true) for (const o of filtered) next[o.num] = true;
                      setSelected(next);
                    }}
                  />
                </TableHead>
                <TableHead className={cn(HEAD, "w-20")}>Order</TableHead>
                <TableHead className={cn(HEAD, "w-28")}>Date</TableHead>
                <TableHead className={HEAD}>Customer</TableHead>
                <TableHead className={cn(HEAD, "w-14 text-right")}>Items</TableHead>
                <TableHead className={cn(HEAD, "w-28 text-right")}>Total</TableHead>
                <TableHead className={cn(HEAD, "w-32")}>Payment</TableHead>
                <TableHead className={cn(HEAD, "w-24")}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow
                  key={o.num}
                  onClick={() => navigate(`/orders/${o.num}`)}
                  data-state={selected[o.num] ? "selected" : undefined}
                  className="cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={!!selected[o.num]}
                      onCheckedChange={(c) => setSelected((s) => ({ ...s, [o.num]: c === true }))}
                    />
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">#{o.num}</TableCell>
                  <TableCell className="text-muted-foreground">{rel(o.min)}</TableCell>
                  <TableCell className="truncate">
                    {o.cust}
                    {o.guest && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        Guest
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {o.itemCount ?? 0}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(o.total)}</TableCell>
                  <TableCell className="text-muted-foreground">{PAY_LABELS[o.pay]}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-3 py-2.5 text-xs text-muted-foreground">
            <span>
              Showing 1–{filtered.length} of {filtered.length}
            </span>
            <span className="flex gap-1">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </span>
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-12 text-center shadow-sm">
          <div className="text-muted-foreground">
            {firstRun
              ? "Orders will appear here when customers start buying."
              : "No orders match these filters."}
          </div>
        </Card>
      )}
    </div>
  );
}
