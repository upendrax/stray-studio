import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/state/store-context";
import { moneyShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import type { StoreSettings } from "@/lib/mock-data";

const TABS = [
  ["general", "General"],
  ["shipping", "Shipping"],
  ["payments", "Payments"],
  ["emails", "Emails"],
] as const;
type Tab = (typeof TABS)[number][0];

const EMAILS: { name: string; subject: string; key: keyof StoreSettings | null }[] = [
  { name: "Order confirmation", subject: "Your order #1046 is confirmed — Rs. 4,700.00", key: null },
  { name: "Payment approved", subject: "Your bank transfer for order #1042 was approved", key: "emApproved" },
  { name: "Payment rejected", subject: "There was a problem with your payment slip", key: "emRejected" },
  { name: "Order shipped", subject: "Your order is on the way", key: "emShipped" },
  { name: "Order delivered", subject: "Your order was delivered — thank you!", key: "emDelivered" },
  { name: "OTP sign-in code", subject: "Your Salt & Cotton sign-in code is 482913", key: null },
];

export default function Settings() {
  const { settings: st, settingsDirty, patchSettings, saveSettings, discardSettings } =
    useStore();
  const [tab, setTab] = useState<Tab>("general");
  const [reveal, setReveal] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const payToggle = (key: "phOn" | "bankOn") => {
    const enabledCount = ["phOn", "bankOn"].filter(
      (k) => st[k as keyof StoreSettings],
    ).length;
    if (st[key] && enabledCount <= 1) {
      toast("At least one payment method must stay enabled");
      return;
    }
    patchSettings({ [key]: !st[key] });
  };

  const rate = Number(st.shipRate) || 0;
  const freeOver = Number(st.shipFree) || 0;
  const shipPreview =
    (rate ? `Customers pay ${moneyShort(rate)} delivery.` : "Delivery is free for all orders.") +
    (rate && freeOver ? ` Orders over ${moneyShort(freeOver)} ship free.` : "");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="How your store runs — details, delivery, payments and emails."
      />
      <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-5">
        {/* Sub-nav */}
        <nav className="flex flex-col gap-px">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "h-[30px] rounded-md px-2.5 text-left text-[13px]",
                tab === key
                  ? "bg-accent font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex max-w-[640px] flex-col gap-4">
          {tab === "general" && (
            <Card className="gap-0 p-4">
              <div className="mb-3 font-semibold">Store details</div>
              <div className="mb-3.5 flex items-start gap-4">
                <div className="grid gap-1.5">
                  <Label>Logo</Label>
                  <button className="flex size-[72px] flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed text-muted-foreground hover:border-ring">
                    <span className="flex size-7 items-center justify-center rounded-[7px] bg-primary text-[13px] font-bold text-primary-foreground">
                      S
                    </span>
                    <span className="text-[9px]">Replace</span>
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  <div className="grid gap-1.5">
                    <Label>Store name</Label>
                    <Input
                      value={st.storeName}
                      onChange={(e) => patchSettings({ storeName: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Contact email</Label>
                      <Input
                        value={st.email}
                        onChange={(e) => patchSettings({ email: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Phone</Label>
                      <Input
                        value={st.phone}
                        onChange={(e) => patchSettings({ phone: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mb-3.5 grid gap-1.5">
                <Label>Business address</Label>
                <Textarea
                  value={st.address}
                  onChange={(e) => patchSettings({ address: e.target.value })}
                  className="h-16 resize-none"
                />
              </div>
              <div className="grid w-60 gap-1.5">
                <Label>Currency</Label>
                <Input value="LKR — Sri Lankan Rupee" disabled className="h-9" />
                <div className="text-[11px] text-muted-foreground">
                  Multi-currency is coming later
                </div>
              </div>
            </Card>
          )}

          {tab === "shipping" && (
            <Card className="gap-0 p-4">
              <div className="mb-3 font-semibold">Delivery</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Delivery charge (Rs.)</Label>
                  <Input
                    value={st.shipRate}
                    onChange={(e) => patchSettings({ shipRate: e.target.value })}
                    className="h-9 tabular-nums"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Free delivery for orders over (Rs.)</Label>
                  <Input
                    value={st.shipFree}
                    onChange={(e) => patchSettings({ shipFree: e.target.value })}
                    placeholder="Never"
                    className="h-9 tabular-nums"
                  />
                </div>
              </div>
              <div className="mt-3.5 rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                {shipPreview}
              </div>
            </Card>
          )}

          {tab === "payments" && (
            <>
              <Card className="gap-0 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">PayHere</div>
                    <div className="text-xs text-muted-foreground">Online card payments</div>
                  </div>
                  <Switch checked={st.phOn} onCheckedChange={() => payToggle("phOn")} />
                </div>
                {st.phOn && (
                  <>
                    <div className="mt-3.5 grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>Merchant ID</Label>
                        <Input
                          value={st.phId}
                          onChange={(e) => patchSettings({ phId: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Merchant Secret</Label>
                        <div className="relative">
                          <Input
                            type={reveal ? "text" : "password"}
                            value={st.phSecret}
                            onChange={(e) => patchSettings({ phSecret: e.target.value })}
                            className="h-9 pr-[52px] font-mono text-xs"
                          />
                          <button
                            onClick={() => setReveal((r) => !r)}
                            className="absolute right-1 top-1 h-[22px] rounded bg-muted px-2 text-[11px] text-muted-foreground"
                          >
                            {reveal ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <Tabs
                        value={st.phSandbox ? "Sandbox" : "Live"}
                        onValueChange={(v) => patchSettings({ phSandbox: v === "Sandbox" })}
                      >
                        <TabsList className="h-7">
                          <TabsTrigger value="Sandbox" className="px-2.5 text-xs">
                            Sandbox
                          </TabsTrigger>
                          <TabsTrigger value="Live" className="px-2.5 text-xs">
                            Live
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {st.phSandbox && (
                        <Badge className="bg-status-pending-bg text-[11px] text-status-pending-fg">
                          Test mode — real cards won't be charged
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </Card>

              <Card className="gap-0 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">Bank transfer</div>
                    <div className="text-xs text-muted-foreground">
                      Customers upload a payment slip; you approve it from the
                      order page.
                    </div>
                  </div>
                  <Switch checked={st.bankOn} onCheckedChange={() => payToggle("bankOn")} />
                </div>
                {st.bankOn && (
                  <div className="mt-3.5 grid gap-1.5">
                    <Label>Bank details shown at checkout</Label>
                    <Textarea
                      value={st.bankDetails}
                      onChange={(e) => patchSettings({ bankDetails: e.target.value })}
                      className="h-[72px] resize-none"
                    />
                  </div>
                )}
              </Card>
              <div className="text-[11px] text-muted-foreground">
                At least one payment method must stay enabled.
              </div>
            </>
          )}

          {tab === "emails" && (
            <>
              <div className="text-xs text-muted-foreground">
                Emails sent to your customers. Your logo and accent color are
                applied automatically — full template editing is coming later.
              </div>
              <Card className="gap-0 overflow-hidden py-0">
                {EMAILS.map((em) => (
                  <div
                    key={em.name}
                    className="flex items-center gap-3 border-b px-4 py-[11px] last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{em.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {em.subject}
                      </div>
                    </div>
                    {em.key ? (
                      <Switch
                        checked={st[em.key] as boolean}
                        onCheckedChange={() =>
                          patchSettings({ [em.key as string]: !st[em.key as keyof StoreSettings] })
                        }
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Always on</span>
                    )}
                  </div>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Save bar */}
      {settingsDirty && (
        <div className="pointer-events-none sticky bottom-4 z-40 flex justify-center px-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-[10px] border bg-popover py-2 pl-4 pr-2 shadow-lg">
            <span className="text-[13px]">Unsaved changes</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  saveSettings();
                  toast("Settings saved");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes on this page. If you leave now, they'll
              be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                discardSettings();
                setConfirmDiscard(false);
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
