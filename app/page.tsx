import { Brief } from "@/components/Brief";
import { allAnnouncements } from "@/lib/store";
import { PORTFOLIO } from "@/lib/portfolio";

export default function Page() {
  const announcements = allAnnouncements();
  // The corpus is a snapshot, so "now" is its newest filing. This keeps the 24h window
  // meaningful whenever the demo is opened, instead of going empty after a weekend.
  const now = announcements[0]?.at ?? new Date().toISOString();
  return <Brief announcements={announcements} now={now} portfolioSize={PORTFOLIO.length} />;
}
