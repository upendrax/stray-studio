// Money is integer cents (LKR) end-to-end; format only at the edge.

export function money(cents: number): string {
  return `Rs. ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// "Rs. 2,800.00" or "From Rs. 2,800.00" when a variable product spans a range.
export function priceLabel(min: number, max: number): string {
  return min === max ? money(min) : `From ${money(min)}`;
}

// Percentage off, for a sale badge. Returns null when there's no real discount.
export function discountPct(price: number, compareAt: number | null): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
