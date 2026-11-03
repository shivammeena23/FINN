import type { Announcement, AlertConfig, Bar, Signal } from "./types";

/**
 * Triggered alerts (push flavour 2).
 *
 * Thresholds are the investor's to set, not ours - the brief is explicit that the point
 * is "I decide what unusual means". So this is a pure function of (data, config) and
 * recomputes instantly when the investor moves a slider.
 */

/** Trailing average volume over the N bars before `idx`, excluding the bar itself. */
function trailingVolume(bars: Bar[], idx: number, n = 20): number | null {
  const start = Math.max(0, idx - n);
  const window = bars.slice(start, idx);
  if (window.length < 5) return null;
  const sum = window.reduce((s, b) => s + b.volume, 0);
  return sum / window.length;
}

export interface SignalInput {
  symbol: string;
  company: string;
  bars: Bar[];
}

/**
 * Evaluate price/volume thresholds on the most recent bar of each series, plus
 * category-based alerts on announcements inside the window.
 */
export function evaluateSignals(
  series: SignalInput[],
  announcements: Announcement[],
  config: AlertConfig,
  lookbackDays = 5,
): Signal[] {
  const out: Signal[] = [];

  for (const { symbol, company, bars } of series) {
    if (bars.length < 7) continue;
    const from = Math.max(1, bars.length - lookbackDays);

    for (let i = from; i < bars.length; i++) {
      const bar = bars[i];
      const prev = bars[i - 1];

      // --- price move ---
      const changePct = ((bar.close - prev.close) / prev.close) * 100;
      if (Math.abs(changePct) >= config.priceMovePct) {
        out.push({
          id: `px-${symbol}-${bar.date}`,
          kind: "price",
          symbol,
          company,
          at: bar.date,
          changePct,
          headline: `${symbol} ${changePct > 0 ? "up" : "down"} ${Math.abs(changePct).toFixed(1)}%`,
          detail: `Closed at ${bar.close.toLocaleString("en-IN")} from ${prev.close.toLocaleString("en-IN")}, beyond your ±${config.priceMovePct}% threshold.`,
        });
      }

      // --- volume spike ---
      const avg = trailingVolume(bars, i);
      if (avg && avg > 0) {
        const x = bar.volume / avg;
        if (x >= config.volumeMultiple) {
          out.push({
            id: `vol-${symbol}-${bar.date}`,
            kind: "volume",
            symbol,
            company,
            at: bar.date,
            volumeX: x,
            headline: `${symbol} volume ${x.toFixed(1)}x its 20-day average`,
            detail: `${(bar.volume / 1e6).toFixed(1)}M shares against a ${(avg / 1e6).toFixed(1)}M average, past your ${config.volumeMultiple}x threshold.`,
          });
        }
      }
    }
  }

  // --- category alerts ---
  const watched = new Set(config.categories);
  for (const a of announcements) {
    if (!watched.has(a.category)) continue;
    if (a.bucket === "NOISE") continue; // respect triage even inside a watched category
    out.push({
      id: `cat-${a.id}`,
      kind: "category",
      symbol: a.symbol,
      company: a.company,
      at: a.at,
      headline: `${a.symbol}: ${a.category.replace("_", " ")}`,
      detail: a.why ?? a.text,
      announcementId: a.id,
    });
  }

  return out.sort((x, y) => y.at.localeCompare(x.at));
}
