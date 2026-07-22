import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/mock-data";

const styles: Record<OrderStatus, string> = {
  Pending: "bg-status-pending-bg text-status-pending-fg",
  Paid: "bg-status-paid-bg text-status-paid-fg",
  Shipped: "bg-status-shipped-bg text-status-shipped-fg",
  Delivered: "bg-status-delivered-bg text-status-delivered-fg",
  Cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
  Refunded: "bg-status-refunded-bg text-status-refunded-fg",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={cn("text-[11px]", styles[status])}>{status}</Badge>
  );
}
