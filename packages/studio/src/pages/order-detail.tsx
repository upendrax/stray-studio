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
import type { OrderStatus } from "@/lib/mock-data";

type DialogKind = "ship" | "reject" | "cancel" | "refund" | null;

export default function OrderDetail() {
  const { num } = useParams();
  const navigate = useNavigate();
  const { orders, mutateOrder } = useStore();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [shipCourier, setShipCourier] = useState("");
  const [shipTracking, setShipTracking] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [noteInput, setNoteInput] = useState("");

  const order = orders.find((o) => o.num === Number(num));
  useEffect(() => {
    setNoteInput(order?.note ?? "");
  }, [order?.num]);
  if (!order) {
    return (
      <Card className="px-6 py-12 text-center text-muted-foreground shadow-sm">
        Order not found.
      </Card>
    );
  }
  const o = order;

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
      mutateOrder(o.num, (n) => { n.status = "Paid"; }, "Marked as paid");
      toast("Order marked as paid");
    } else if (o.status === "Paid") {
      setShipCourier("");
      setShipTracking("");
      setDialog("ship");
    } else if (o.status === "Shipped") {
      mutateOrder(o.num, (n) => { n.status = "Delivered"; }, "Marked as delivered");
      toast("Order marked as delivered");
    }
  };

  const confirmShip = () => {
    mutateOrder(o.num, (n) => {
      n.status = "Shipped";
      if (shipCourier.trim() || shipTracking.trim())
        n.tracking = { courier: shipCourier.trim() || "—", number: shipTracking.trim() };
    }, "Marked as shipped");
    toast("Order marked as shipped — customer notified");
    setDialog(null);
  };

  const approveSlip = () => {
    mutateOrder(o.num, (n) => { n.status = "Paid"; n.slip = false; }, "Payment approved (bank slip)");
    toast("Payment approved — order moved to Paid");
  };

  const confirmReject = () => {
    mutateOrder(o.num, (n) => { n.slip = false; }, "Bank slip rejected — customer notified");
    toast("Slip rejected — customer notified");
    setDialog(null);
  };

  const confirmCancel = () => {
    mutateOrder(o.num, (n) => { n.status = "Cancelled"; }, "Order cancelled — items restocked");
    toast("Order cancelled — items restocked");
    setDialog(null);
  };

  const confirmRefund = () => {
    mutateOrder(o.num, (n) => { n.status = "Refunded"; }, refundRef.trim() ? `Refund recorded — ref ${refundRef.trim()}` : "Refund recorded");
    toast("Refund recorded");
    setDialog(null);
  };

  const revert = () => {
    const back = ({ Paid: "Pending", Shipped: "Paid", Delivered: "Shipped" } as Partial<Record<OrderStatus, OrderStatus>>)[o.status];
    if (!back) return;
    mutateOrder(o.num, (n) => { n.status = back; }, `Reverted to ${back}`);
    toast(`Order reverted to ${back}`);
  };

  const addNote = () => {
    if (!noteInput.trim()) return;
    mutateOrder(o.num, () => {}, noteInput.trim(), { note: true });
    setNoteInput("");
    toast("Note added");
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    toast(`${label} copied`);
  };
  const copyAddress = () => copy(o.address, "Address");

  const saveNote = (value: string) => {
    if (value === (o.note ?? "")) return;
    mutateOrder(o.num, (n) => {
      n.note = value;
    });
    toast("Note saved");
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
          <Button size="sm" onClick={advance}>
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
                      <Button size="sm" onClick={approveSlip}>
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
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Add an internal note (never shown to the customer)"
                className="h-9"
              />
              <Button size="sm" variant="outline" onClick={addNote}>
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
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onBlur={() => saveNote(noteInput.trim())}
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
