// Client-side customer auth + account data. The session cookie lives on the
// core API origin, so auth state is only knowable in the browser (credentialed
// fetch) — account pages check `fetchMe` on load and redirect if signed out.
import type { Address, AccountOrder, OrderConfirmation } from "./types";

async function req(base: string, path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  return res;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

// --- Better Auth email-OTP ---------------------------------------------
export async function sendOtp(base: string, email: string): Promise<void> {
  const res = await req(base, "/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  await json(res);
}

export async function verifyOtp(base: string, email: string, otp: string): Promise<void> {
  const res = await req(base, "/api/auth/sign-in/email-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
  await json(res);
}

export async function signOut(base: string): Promise<void> {
  await req(base, "/api/auth/sign-out", { method: "POST" });
}

// --- Account (our API) --------------------------------------------------
export type Me = { id: string; email: string; name: string };

export async function fetchMe(base: string): Promise<Me | null> {
  const res = await req(base, "/api/store/account/me");
  if (res.status === 401) return null;
  return (await json<{ user: Me }>(res)).user;
}

export async function getOrders(base: string): Promise<AccountOrder[]> {
  return (await json<{ orders: AccountOrder[] }>(await req(base, "/api/store/account/orders"))).orders;
}

export async function getOrder(base: string, number: number): Promise<OrderConfirmation> {
  return (await json<{ order: OrderConfirmation }>(await req(base, `/api/store/account/orders/${number}`))).order;
}

export async function getAddresses(base: string): Promise<Address[]> {
  return (await json<{ addresses: Address[] }>(await req(base, "/api/store/account/addresses"))).addresses;
}

export async function saveAddress(base: string, body: Partial<Address>, id?: string): Promise<Address> {
  const res = await req(base, id ? `/api/store/account/addresses/${id}` : "/api/store/account/addresses", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
  return (await json<{ address: Address }>(res)).address;
}

export async function deleteAddress(base: string, id: string): Promise<void> {
  await json(await req(base, `/api/store/account/addresses/${id}`, { method: "DELETE" }));
}
