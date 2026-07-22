// Mock-data phase: amounts are whole rupees. When the real API lands,
// amounts become integer cents and these move to /100 at the call sites.
export function money(rs: number): string {
  return `Rs. ${rs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function moneyShort(rs: number): string {
  return `Rs. ${rs.toLocaleString("en-US")}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Relative for < 7 days, absolute date beyond. `min` = minutes ago. */
export function rel(min: number): string {
  if (min < 60) return `${min} min ago`;
  if (min < 1440) {
    const h = Math.round(min / 60);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  if (min < 10080) {
    const d = Math.round(min / 1440);
    return `${d} ${d === 1 ? "day" : "days"} ago`;
  }
  const d = new Date(Date.now() - min * 60000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Like rel(), but with time-of-day once it goes absolute. */
export function relLong(min: number): string {
  if (min < 10080) return rel(min);
  const d = new Date(Date.now() - min * 60000);
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(
    d.getMinutes(),
  ).padStart(2, "0")} ${ap}`;
}
