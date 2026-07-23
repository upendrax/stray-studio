// Client-side shopping bag (localStorage). Catalog phase: this only tracks the
// lines a shopper picks and drives the header count. Server-side validation +
// checkout arrive in the cart/checkout milestone and will read this same shape.
export type BagLine = {
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  variantLabel: string | null;
  price: number; // cents, snapshot for display only (re-validated at checkout)
  image: string | null; // r2Key
  qty: number;
};

const KEY = "stray:bag:v1";

export function readBag(): BagLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BagLine[]) : [];
  } catch {
    return [];
  }
}

export function writeBag(lines: BagLine[]): void {
  localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new CustomEvent("bag:change"));
}

export function addToBag(line: Omit<BagLine, "qty">, qty = 1): void {
  const lines = readBag();
  const existing = lines.find((l) => l.variantId === line.variantId);
  if (existing) existing.qty += qty;
  else lines.push({ ...line, qty });
  writeBag(lines);
}

export function bagCount(): number {
  return readBag().reduce((n, l) => n + l.qty, 0);
}

// Reflect the count into every [data-bag-count] node.
export function refreshBadges(): void {
  const n = bagCount();
  document.querySelectorAll<HTMLElement>("[data-bag-count]").forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
}
