/** Presentation helpers. Kept tiny and dependency-free. */

/** "4h ago", "2d ago" - relative to the corpus's own newest filing, not wall clock. */
export function timeAgo(iso: string, now: string): string {
  const ms = new Date(now).getTime() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Indian numbering: 12,34,567. */
export function inr(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Compact crore formatting for headline financials. */
export function crore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100_000) return `${(n / 1000).toFixed(1)}k`;
  return inr(Math.round(n));
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

/**
 * Percentage change, or null when the comparison is not meaningful.
 *
 * Demergers and restructurings leave near-zero stubs in the prior-period column
 * (Tata Motors' year-ago commercial-vehicle EBITDA, for instance), and dividing by them
 * produces a headline like "+44,120%" that is arithmetically true and completely useless.
 * A loss-to-profit swing has the same problem. In both cases we show nothing rather than
 * a number the investor would have to mentally discard.
 */
export function deltaPct(cur: number | null, base: number | null): number | null {
  if (cur == null || base == null || base === 0) return null;
  if (Math.sign(cur) !== Math.sign(base)) return null;
  if (Math.abs(base) < Math.abs(cur) * 0.02) return null;
  return ((cur - base) / Math.abs(base)) * 100;
}

/**
 * NSE attachment text is often a boilerplate preamble plus the real content.
 * Strip the preamble so cards lead with substance.
 */
export function cleanFilingText(text: string, company?: string): string {
  let t = (text ?? "").replace(/&#8377;/g, "₹").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  t = t.replace(
    /^(.{0,70}?Limited)\s+has\s+(informed|submitted to)\s+the\s+Exchange\s*(about|regarding|that|,)?\s*/i,
    "",
  );
  t = t.replace(/^the\s+(Exchange\s+)?/i, "");
  if (company) t = t.replace(new RegExp(`^${company}\\s+`, "i"), "");
  if (!t) return (text ?? "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const BUCKET_COLOR = {
  ACT: "var(--act)",
  WATCH: "var(--watch)",
  NOISE: "var(--noise)",
} as const;
