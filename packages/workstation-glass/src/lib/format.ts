export const UNAVAILABLE = "Unavailable";

export function money(v: number | undefined | null, signed = false) {
  if (v == null) return UNAVAILABLE;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? "-" : signed && v > 0 ? "+" : "";
  return `${sign}$${s}`;
}
export function price(v: number | undefined | null) {
  return v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
export function qty(v: number | undefined | null, signed = false) {
  if (v == null) return "—";
  return (signed && v > 0 ? "+" : "") + v.toLocaleString("en-US");
}
export function pct(v: number | undefined | null) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
export function time(v: string | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
export const tone = (v: number | undefined | null) =>
  v == null || v === 0 ? "text-foreground" : v > 0 ? "text-positive" : "text-negative";
