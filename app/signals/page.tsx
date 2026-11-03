import { Signals } from "@/components/Signals";
import { allAnnouncements, allPrices } from "@/lib/store";
import { PORTFOLIO } from "@/lib/portfolio";

/** Alerts are a "what just happened" surface, so both halves share one lookback. */
const LOOKBACK_DAYS = 10;

export default function Page() {
  const prices = allPrices();
  const all = allAnnouncements();
  const now = all[0]?.at ?? new Date().toISOString();
  const cutoff = new Date(new Date(now).getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();

  // Only portfolio holdings generate alerts; the ad-hoc research set is not "mine".
  const series = PORTFOLIO.map((c) => ({
    symbol: c.symbol,
    company: c.name,
    bars: prices[c.symbol] ?? [],
  })).filter((s) => s.bars.length > 0);

  const portfolioSymbols = new Set(PORTFOLIO.map((c) => c.symbol));
  const recent = all.filter((a) => a.at >= cutoff && portfolioSymbols.has(a.symbol));

  return <Signals series={series} announcements={recent} now={now} />;
}
