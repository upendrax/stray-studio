import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, MoreHorizontal } from "lucide-react";
import { useStore } from "@/state/store-context";
import { money, rel, relLong } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { Order, OrderStatus } from "@/lib/mock-data";

type DialogKind = "ship" | "reject" | "cancel" | "refund" | null;

export default function OrderDetail() {
  const { num } = useParams();
  const navigate = useNavigate();
  const { getOrder, setOrderStatus, orderSlip, addOrderNote, setOrderNote } = useStore();

  const [o, setO] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [shipCourier, setShipCourier] = useState("");
  const [shipTracking, setShipTracking] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [timelineNote, setTimelineNote] = useState(""); // "Add note" → timeline event
  const [privateNote, setPrivateNote] = useState(""); // right-rail Notes card

  const orderNum = Number(num);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOrder(orderNum)
      .then((ord) => {
        if (!alive) return;
        setO(ord);
        setPrivateNote(ord.note ?? "");
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
  }, [orderNum, getOrder]);

  if (notFound) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Order not found.
      </Card>
    );
  }
  if (loading || !o) {
    return (
      <Card className="flex items-center justify-center px-6 py-16 text-muted-foreground shadow-sm">
        <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </Card>
    );
  }

  // Run an order action, swap in the returned order, toast, and surface errors.
  const run = async (fn: () => Promise<Order>, ok: string) => {
    setBusy(true);
    try {
      setO(await fn());
      toast(ok);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const payView: [string, string] =
    o.pay === "payhere"
      ? [
          o.status === "Pending" ? "PayHere — awaiting payment" : "Paid via PayHere",
          o.payRef ? `Reference ${o.payRef} · paid ${rel(o.min - 1)}` : "Awaiting payment",
        ]
      : [
            o.status === "Pending" ? "Bank transfer — awaiting approval" : "Paid via bank transfer",
            o.slip ? "" : "Waiting for the customer to upload a payment slip.",
          ];

  const nextLabel: string | null =
    o.status === "Pending"
      ? o.pay === "bank" && o.slip
        ? null // must approve/reject the slip instead
        : "Mark as paid"
      : o.status === "Paid"
        ? "Mark as shipped"
        : o.status === "Shipped"
          ? "Mark as delivered"
          : null;

  const revertLabel =
    ({ Paid: "Revert to Pending", Shipped: "Revert to Paid", Delivered: "Revert to Shipped" } as Partial<Record<OrderStatus, string>>)[o.status] ?? null;
  const canCancel = o.status === "Pending" || o.status === "Paid";
  const canRefund = ["Paid", "Shipped", "Delivered"].includes(o.status);
  const showSlip = !!(o.slip && o.status === "Pending");

  const advance = () => {
    if (o.status === "Pending") {
      run(() => setOrderStatus(o.num, "paid", { message: "Marked as paid" }), "Order marked as paid");
    } else if (o.status === "Paid") {
      setShipCourier("");
      setShipTracking("");
      setDialog("ship");
    } else if (o.status === "Shipped") {
      run(() => setOrderStatus(o.num, "delivered", { message: "Marked as delivered" }), "Order marked as delivered");
    }
  };

  const confirmShip = () => {
    run(
      () =>
        setOrderStatus(o.num, "shipped", {
          courierName: shipCourier.trim() || undefined,
          trackingNumber: shipTracking.trim() || undefined,
          message: "Marked as shipped",
        }),
      "Order marked as shipped — customer notified",
    );
    setDialog(null);
  };

  const approveSlip = () =>
    run(() => orderSlip(o.num, "approve"), "Payment approved — order moved to Paid");

  const confirmReject = () => {
    run(() => orderSlip(o.num, "reject", rejectReason.trim() || undefined), "Slip rejected — customer notified");
    setDialog(null);
  };

  const confirmCancel = () => {
    run(() => setOrderStatus(o.num, "cancelled", { message: "Order cancelled — items restocked" }), "Order cancelled — items restocked");
    setDialog(null);
  };

  const confirmRefund = () => {
    const ref = refundRef.trim();
    run(
      () => setOrderStatus(o.num, "refunded", { refundReference: ref || undefined, message: ref ? `Refund recorded — ref ${ref}` : "Refund recorded" }),
      "Refund recorded",
    );
    setDialog(null);
  };

  const revert = () => {
    const back = ({ Paid: "Pending", Shipped: "Paid", Delivered: "Shipped" } as Partial<Record<OrderStatus, OrderStatus>>)[o.status];
    if (!back) return;
    run(() => setOrderStatus(o.num, back.toLowerCase(), { message: `Reverted to ${back}` }), `Order reverted to ${back}`);
  };

  const addNote = async () => {
    if (!timelineNote.trim()) return;
    await run(() => addOrderNote(o.num, timelineNote.trim()), "Note added");
    setTimelineNote("");
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    toast(`${label} copied`);
  };
  const copyAddress = () => copy(o.address, "Address");

  const saveNote = (value: string) => {
    if (value === (o.note ?? "")) return;
    run(() => setOrderNote(o.num, value), "Note saved");
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          title="Back to orders"
          onClick={() => navigate("/orders")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="text-[16px] font-semibold tracking-tight tabular-nums">
          Order #{o.num}
        </div>
        <StatusBadge status={o.status} />
        <span className="text-xs text-muted-foreground">{relLong(o.min)}</span>
        <div className="flex-1" />
        {nextLabel && (
          <Button size="sm" onClick={advance} disabled={busy}>
            {nextLabel}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {revertLabel && <DropdownMenuItem onClick={revert}>{revertLabel}</DropdownMenuItem>}
            {canCancel && (
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("cancel")}>
                Cancel order
              </DropdownMenuItem>
            )}
            {canRefund && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => { setRefundRef(""); setDialog("refund"); }}
              >
                Refund…
              </DropdownMenuItem>
            )}
            {!revertLabel && !canCancel && !canRefund && (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                No actions available
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Items */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-b px-4 py-3 font-semibold">Items</div>
            {o.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-4 py-2.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] font-semibold text-muted-foreground">
                  {l.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {l.name}
                    {l.variant ? ` — ${l.variant}` : ""}
                  </div>
                  {l.sku && (
                    <div className="text-[11px] text-muted-foreground">SKU {l.sku}</div>
                  )}
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {l.qty} × {money(l.price)}
                </div>
                <div className="w-[110px] text-right font-medium tabular-nums">
                  {money(l.qty * l.price)}
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-1.5 px-4 py-3 tabular-nums">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{money(o.subtotal)}</span>
              </div>
              {o.disc && (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Discount{" "}
                    <span className="rounded bg-muted px-1.5 py-px font-mono text-[11px]">
                      {o.disc.code}
                    </span>
                  </span>
                  <span>−{money(o.disc.amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{o.ship ? money(o.ship) : "Free"}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                <span>Total</span>
                <span>{money(o.total)}</span>
              </div>
            </div>
          </Card>

          {/* Payment */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-b px-4 py-3 font-semibold">Payment</div>
            <div className="px-4 py-3">
              <div className="font-medium">{payView[0]}</div>
              {payView[1] && (
                <div className="mt-0.5 text-xs text-muted-foreground">{payView[1]}</div>
              )}
              {showSlip && (
                <div className="mt-3 flex items-start gap-3">
                  <div
                    className="flex h-[150px] w-[120px] cursor-zoom-in items-center justify-center rounded-md border p-2 text-center font-mono text-[10px] text-muted-foreground"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, var(--muted), var(--muted) 8px, var(--background) 8px, var(--background) 16px)",
                    }}
                  >
                    bank slip photo (click to zoom)
                  </div>
                  <div className="flex-1">
                    <div className="mb-2.5 text-xs text-muted-foreground">
                      Slip uploaded {rel(o.slipMin ?? 60)}. Check the amount and
                      reference, then approve or reject.
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={approveSlip} disabled={busy}>
                        Approve payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectReason(""); setDialog("reject"); }}
                      >
                        Reject…
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Timeline */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-b px-4 py-3 font-semibold">Timeline</div>
            <div className="flex gap-2 border-b px-4 py-3">
              <Input
                value={timelineNote}
                onChange={(e) => setTimelineNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Add an internal note (never shown to the customer)"
                className="h-9"
              />
              <Button size="sm" variant="outline" onClick={addNote} disabled={busy}>
                Add note
              </Button>
            </div>
            <div className="flex flex-col px-4 pb-4 pt-3">
              {o.events.map((ev, i) => (
                <div key={i} className="flex gap-2.5 py-1.5">
                  <div className="flex w-2 shrink-0 flex-col items-center pt-[5px]">
                    <span className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
                    {i < o.events.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="pb-1.5">
                    <div
                      className={cn(
                        "text-[13px]",
                        ev.note ? "italic" : "font-medium",
                      )}
                    >
                      {ev.title}
                    </div>
                    <div className="mt-px text-[11px] text-muted-foreground">
                      {ev.min === 0 ? "Just now" : relLong(ev.min)} · {ev.actor}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Customer</div>
            <div className="font-medium">
              {o.cust}
              {o.guest && (
                <span className="ml-1.5 rounded-full border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                  Guest
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              <div className="group flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{o.email}</span>
                <button
                  onClick={() => copy(o.email, "Email")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Copy email"
                >
                  <Copy className="size-3" />
                </button>
              </div>
              <div className="group flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{o.phone}</span>
                <button
                  onClick={() => copy(o.phone, "Phone")}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Copy phone"
                >
                  <Copy className="size-3" />
                </button>
              </div>
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">{o.orderCount}</div>
          </Card>

          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 font-semibold">Notes</div>
            <Textarea
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value)}
              onBlur={() => saveNote(privateNote.trim())}
              placeholder="Add a private note about this order…"
              className="min-h-[64px] resize-none text-xs"
            />
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Only you can see this — never shown to the customer.
            </div>
          </Card>

          <Card className="gap-0 px-4 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">Shipping address</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                onClick={copyAddress}
              >
                <Copy className="size-3" />
                Copy
              </Button>
            </div>
            <div className="whitespace-pre-line text-xs text-muted-foreground">
              {o.address}
            </div>
          </Card>

          {o.tracking && (
            <Card className="gap-0 px-4 py-3.5">
              <div className="mb-2 font-semibold">Tracking</div>
              <div className="text-xs">{o.tracking.courier}</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                {o.tracking.number}
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                Shown to the customer in their account and the shipped email.
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="w-[400px]">
          {dialog === "ship" && (
            <>
              <DialogHeader>
                <DialogTitle>Mark order as shipped?</DialogTitle>
                <DialogDescription>
                  The customer gets a "your order is on the way" email. Tracking
                  details are optional.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2.5">
                <div className="grid gap-1.5">
                  <Label>Courier (optional)</Label>
                  <Input
                    value={shipCourier}
                    onChange={(e) => setShipCourier(e.target.value)}
                    placeholder="e.g. Koombiyo, Pronto"
                    className="h-9"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Tracking number (optional)</Label>
                  <Input
                    value={shipTracking}
                    onChange={(e) => setShipTracking(e.target.value)}
                    placeholder="e.g. LK4429810"
                    className="h-9"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmShip}>
                  Mark as shipped
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "reject" && (
            <>
              <DialogHeader>
                <DialogTitle>Reject this payment slip?</DialogTitle>
                <DialogDescription>
                  The customer is emailed the reason and can upload a new slip.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>Reason (sent to the customer)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Amount on the slip doesn't match the order total"
                  className="h-16 resize-none"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={confirmReject}>
                  Reject slip
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel order #{o.num}?</DialogTitle>
                <DialogDescription>
                  Items go back into stock and the customer is notified. This
                  can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Keep order
                </Button>
                <Button size="sm" variant="destructive" onClick={confirmCancel}>
                  Cancel order
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "refund" && (
            <>
              <DialogHeader>
                <DialogTitle>Record a refund for #{o.num}?</DialogTitle>
                <DialogDescription>
                  Record-keeping only — the refund itself is made outside Stray
                  Studio.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>Refund reference</Label>
                <Input
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                  placeholder="e.g. bank transfer reference"
                  className="h-9"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={confirmRefund}>
                  Record refund
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
