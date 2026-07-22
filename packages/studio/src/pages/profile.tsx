import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/state/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";

export default function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const userEmail = user?.email ?? "";
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [err, setErr] = useState("");

  const updatePassword = () => {
    if (!cur) {
      setErr("Enter your current password.");
      return;
    }
    if (next.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    if (next !== next2) {
      setErr("Passwords don't match.");
      return;
    }
    setErr("");
    setCur("");
    setNext("");
    setNext2("");
    toast("Password updated");
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-4">
      <PageHeader title="Profile" description="Your account details." />
      <Card className="gap-0 p-4">
        <div className="mb-3 font-semibold">Your details</div>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input value={userEmail} disabled className="h-9" />
            <div className="text-[11px] text-muted-foreground">
              Email can't be changed in v1.
            </div>
          </div>
          <Button size="sm" className="self-start" onClick={() => toast("Profile saved")}>
            Save changes
          </Button>
        </div>
      </Card>

      <Card className="gap-0 p-4">
        <div className="mb-3 font-semibold">Change password</div>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Current password</Label>
            <Input
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Confirm</Label>
              <Input
                type="password"
                value={next2}
                onChange={(e) => setNext2(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <Button variant="outline" size="sm" className="self-start" onClick={updatePassword}>
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}
