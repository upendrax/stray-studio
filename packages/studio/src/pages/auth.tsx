import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Auth screens are mock-only until Better Auth is wired: "Sign in" navigates
// straight into the Studio; the demo pill nav below the card jumps between
// the three screens for review.

function AuthFrame({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const links = [
    ["/login", "Login"],
    ["/forgot", "Forgot password"],
    ["/reset", "Reset password"],
  ] as const;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-6 text-foreground">
      <Card className="w-[360px] gap-0 p-7">
        <div className="mb-5 flex flex-col items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-[9px] bg-primary text-base font-bold text-primary-foreground">
            S
          </div>
          <div className="text-center text-[15px] font-semibold">{title}</div>
          {subtitle && (
            <div className="text-center text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        {children}
      </Card>
      <div className="flex flex-wrap justify-center gap-1">
        {links.map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex h-6 items-center rounded-full border px-2.5 text-[11px]",
              pathname === to
                ? "border-ring bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState(false);

  const signIn = () => {
    if (!email.trim() || !pw) {
      setErr(true);
      return;
    }
    navigate("/");
  };

  return (
    <AuthFrame title="Sign in to Salt & Cotton">
      <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label>Email</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Password</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
              className="h-9 pr-[52px]"
            />
            <button
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-1 top-1 h-[22px] rounded bg-muted px-2 text-[11px] text-muted-foreground"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {err && <div className="text-xs text-destructive">Incorrect email or password.</div>}
        <Button size="sm" className="justify-center" onClick={signIn}>
          Sign in
        </Button>
        <Link
          to="/forgot"
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <AuthFrame
      title="Reset your password"
      subtitle={sent ? undefined : "Enter your account email and we'll send a reset link."}
    >
      {sent ? (
        <div className="flex flex-col gap-3 text-center">
          <div className="text-[13px] text-muted-foreground">
            We've sent a reset link if this email exists. Check your inbox.
          </div>
          <Button variant="outline" size="sm" className="justify-center" asChild>
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9"
            />
          </div>
          <Button size="sm" className="justify-center" onClick={() => setSent(true)}>
            Send reset link
          </Button>
          <Link
            to="/login"
            className="text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");

  const doReset = () => {
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match.");
      return;
    }
    toast("Password updated — sign in with your new password");
    navigate("/login");
  };

  return (
    <AuthFrame title="Choose a new password">
      <div className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label>New password</Label>
          <Input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="h-9"
          />
          <div className="text-[11px] text-muted-foreground">
            At least 8 characters.
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Confirm password</Label>
          <Input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="h-9"
          />
        </div>
        {err && <div className="text-xs text-destructive">{err}</div>}
        <Button size="sm" className="justify-center" onClick={doReset}>
          Set new password
        </Button>
      </div>
    </AuthFrame>
  );
}
