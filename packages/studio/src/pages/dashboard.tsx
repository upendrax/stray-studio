import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/state/store-context";
import { chartSeries, lowStockItems } from "@/lib/mock-data";
import { money, rel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { StockDot } from "@/components/stock-dot";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const navigate = useNavigate();
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const { orders, productSummaries, pendingCount } = useStore();
  const todays = orders.filter((o) => o.min < 1440 && o.status !== "Cancelled");
  const todayRev = todays
    .filter((o) => o.status !== "Pending")
    .reduce((s, o) => s + o.total, 0);
  const lowItems = useMemo(() => lowStockItems(productSummaries), [productSummaries]);

  const chartData = useMemo(() => {
    const series = chartSeries(days);
    return series.map((v, i) => {
      const d = new Date(Date.now() - (series.length - 1 - i) * 86400000);
      return { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, value: v };
    });
  }, [days]);
  const periodTotal = chartData.reduce((s, d) => s + d.value, 0);

  const tiles = [
    { label: "Today's revenue", value: money(todayRev), sub: "vs yesterday +12%", arrow: "↑", go: () => {} },
    { label: "Today's orders", value: String(todays.length), sub: "vs yesterday +1", arrow: "↑", go: () => navigate("/orders") },
    { label: "Pending orders", value: String(pendingCount), sub: "needs action", arrow: "", go: () => navigate("/orders?tab=Pending") },
    { label: "Low stock items", value: String(lowItems.length), sub: "at or below alert level", arrow: "", go: () => navigate("/products?stock=low") },
  ];

  const attention = [
    ...orders
      .filter((o) => o.slip && o.status === "Pending")
      .map((o) => ({
        key: `slip-${o.num}`,
        title: `Order #${o.num}`,
        detail: "bank slip uploaded, needs review",
        dot: "low" as const,
        go: () => navigate(`/orders/${o.num}`),
      })),
    ...lowItems.slice(0, 5).map((li) => ({
      key: `low-${li.id}`,
      title: li.label,
      detail: li.qty <= 0 ? "out of stock" : `${li.qty} left`,
      dot: (li.qty <= 0 ? "out" : "low") as "out" | "low",
      go: () => navigate(`/products/${li.id}`),
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Dashboard" description="Salt & Cotton today, at a glance." />
      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={t.go}
            className="rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-ring"
          >
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="mt-0.5 whitespace-nowrap text-[19px] font-semibold tracking-tight tabular-nums">
              {t.value}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              {t.arrow && <span>{t.arrow}</span>}
              {t.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="gap-0 py-0">
          <div className="flex items-center justify-between px-4 pt-3.5">
            <div>
              <div className="font-semibold">Revenue</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {money(periodTotal)} in the last {days} days
              </div>
            </div>
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}>
              <TabsList className="h-7">
                {[7, 30, 90].map((n) => (
                  <TabsTrigger key={n} value={String(n)} className="px-2.5 text-xs">
                    {n}d
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="h-[230px] px-2 pb-1 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 4"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                  minTickGap={80}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  tickCount={4}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => `Rs. ${Math.round(v / 1000)}k`}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-1)"
                  strokeWidth={1.75}
                  fill="var(--chart-1-soft)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

      {/* Recent orders + Needs attention */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Recent orders</div>
            <button
              onClick={() => navigate("/orders")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </button>
          </div>
          {orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              Orders will appear here when customers start buying.
            </div>
          ) : (
            <div>
              {orders.slice(0, 8).map((o) => (
                <button
                  key={o.num}
                  onClick={() => navigate(`/orders/${o.num}`)}
                  className="flex w-full items-center gap-2.5 border-b px-4 py-2 text-xs tabular-nums last:border-b-0 hover:bg-accent"
                >
                  <span className="w-[52px] shrink-0 text-left font-medium">
                    #{o.num}
                  </span>
                  <span className="flex-1 truncate text-left text-muted-foreground">
                    {o.cust}
                  </span>
                  <span className="font-medium">{money(o.total)}</span>
                  <StatusBadge status={o.status} />
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {rel(o.min)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-b px-4 py-3 font-semibold">Needs attention</div>
          {attention.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              All caught up.
            </div>
          ) : (
            <div>
              {attention.map((a) => (
                <button
                  key={a.key}
                  onClick={a.go}
                  className="flex w-full items-center gap-2.5 border-b px-4 py-2 text-xs last:border-b-0 hover:bg-accent"
                >
                  <StockDot level={a.dot} />
                  <span className="flex-1 truncate text-left">
                    <span className="font-medium">{a.title}</span>
                    <span className="text-muted-foreground"> — {a.detail}</span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
