import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff" | "customer";
}

type Status = "loading" | "authed" | "anon";

interface AuthState {
  status: Status;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Confirm the session on load. /api/admin/me is owner-guarded, so a 401/403
  // both mean "not an owner session" -> treat as anonymous.
  useEffect(() => {
    let alive = true;
    api
      .get<{ user: AuthUser }>("/api/admin/me")
      .then((res) => {
        if (!alive) return;
        setUser(res.user);
        setStatus("authed");
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setStatus("anon");
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback<AuthState["signIn"]>(async (email, password) => {
    try {
      await api.post("/api/auth/sign-in/email", { email, password });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Sign in failed";
      return { ok: false, error: msg };
    }
    // Signed in — but the Studio is owner-only. Confirm via /me.
    try {
      const res = await api.get<{ user: AuthUser }>("/api/admin/me");
      setUser(res.user);
      setStatus("authed");
      return { ok: true };
    } catch {
      await api.post("/api/auth/sign-out", {}).catch(() => {});
      setUser(null);
      setStatus("anon");
      return { ok: false, error: "This account can't access the Studio." };
    }
  }, []);

  const signOut = useCallback<AuthState["signOut"]>(async () => {
    await api.post("/api/auth/sign-out", {}).catch(() => {});
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
