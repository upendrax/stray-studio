import type { StockLevel } from "@/lib/mock-data";

const colors: Record<StockLevel, string> = {
  ok: "bg-stock-ok",
  low: "bg-stock-low",
  out: "bg-stock-out",
};

export function StockDot({ level }: { level: StockLevel }) {
  return (
    <span
      className={`inline-block size-[7px] shrink-0 rounded-full ${colors[level]}`}
    />
  );
}
