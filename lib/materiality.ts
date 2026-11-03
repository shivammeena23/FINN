import type { Bucket, Category } from "./types";

/**
 * Triage. This file is the product's opinion.
 *
 * The brief's hard problem is not aggregation, it is filtering: "surfacing the few things
 * that actually matter and burying everything else". So every filing gets a 0-100 score
 * from a category base plus text modifiers, and the score picks a bucket.
 *
 * Scoring is deliberately rules-based and auditable rather than an LLM judgement call:
 * it is free, deterministic, and we can show the investor exactly why something was buried.
 */

/** Base score by category - roughly "how often does this move a stock". */
const BASE: Record<Category, number> = {
  results: 88,
  "M&A": 86,
  management_change: 72,
  fund_raise: 68,
  litigation: 66,
  credit_rating: 60,
  bonus_split: 58,
  dividend: 56,
  insider_trading: 55,
  capex: 54,
  pledging: 54,
  earnings_call: 48,
  press_release: 38,
  postal_ballot: 24,
  agm_egm: 22,
  investor_meetings: 20,
  unclassified: 6,
};

/** Text modifiers. Applied to every filing; they stack, then the total is clamped. */
const MODIFIERS: Array<{ re: RegExp; delta: number; note: string }> = [
  // --- escalate -----------------------------------------------------------
  { re: /\b(CEO|CFO|Managing Director|MD & CEO|Chairman|Whole[- ]time Director)\b/i, delta: 14, note: "senior role" },
  { re: /downgrad|negative outlook|rating watch|default|\bD\b rating/i, delta: 16, note: "credit deterioration" },
  { re: /resign|stepping down|abrupt|with immediate effect/i, delta: 10, note: "abrupt departure" },
  { re: /fraud|forensic|insolvency|\bNCLT\b|winding up|arrest|SEBI order/i, delta: 18, note: "distress or enforcement" },
  { re: /qualified opinion|auditor.{0,20}(resign|qualif)/i, delta: 16, note: "auditor concern" },
  { re: /buy-?back|rights issue|\bQIP\b|preferential allot/i, delta: 10, note: "equity event" },
  { re: /acqui(re|sition)|merger|demerger|slump sale|controlling stake/i, delta: 8, note: "structural change" },
  { re: /transcript/i, delta: 10, note: "transcript now available" },
  { re: /guidance|outlook|upgrade|revise[ds]? (our )?(target|estimate)/i, delta: 6, note: "forward-looking" },
  { re: /record date|ex-?date/i, delta: 4, note: "dated corporate action" },

  // --- suppress -----------------------------------------------------------
  { re: /audio recording/i, delta: -22, note: "audio only, transcript is the signal" },
  // Spinning up a subsidiary is corporate housekeeping, not a deal. Without this it
  // scores like a real acquisition and crowds out the filings that matter.
  { re: /incorporation of (a )?(wholly[- ]owned |step[- ]down )?subsidiar/i, delta: -30, note: "subsidiary incorporation" },
  // The deck is useful context, but the results filing itself is the primary source.
  { re: /investor presentation|earnings presentation/i, delta: -14, note: "presentation, not the filing" },
  // Share allotments are mostly ESOP/warrant housekeeping. Suppress the generic case and
  // let the "equity event" modifier above lift genuine QIP/rights/preferential raises back up.
  { re: /allotment of [\d,]+ (equity shares?|securities|shares?)/i, delta: -24, note: "routine share allotment" },
  { re: /pursuant to (the )?conversion of (share )?warrants?/i, delta: -16, note: "warrant conversion" },
  { re: /statement of deviation|variation\(s\) under Reg/i, delta: -34, note: "quarterly deviation statement" },
  { re: /monitoring agency report/i, delta: -34, note: "monitoring agency filing" },
  { re: /intimation of|prior intimation|notice of (the )?board meeting/i, delta: -16, note: "advance notice, not the event" },
  { re: /newspaper (publication|advertisement)|public notice/i, delta: -28, note: "newspaper copy" },
  { re: /trading window|closure of trading window/i, delta: -40, note: "trading-window housekeeping" },
  { re: /\bESOP\b|\bESOS\b|\bESPS\b|employee stock option/i, delta: -36, note: "ESOP paperwork" },
  { re: /certificate under|compliance certificate|Regulation 7\(3\)|Regulation 74\(5\)/i, delta: -34, note: "compliance certificate" },
  { re: /loss of share certificate|duplicate share certificate/i, delta: -40, note: "share-certificate admin" },
  { re: /structural digital database|\bSDD\b/i, delta: -40, note: "SDD compliance" },
  { re: /corrigend|addend|clerical|typograph/i, delta: -18, note: "correction to an earlier filing" },
];

/** Score >= ACT_AT goes to ACT; >= WATCH_AT goes to WATCH; below that is buried. */
export const ACT_AT = 70;
export const WATCH_AT = 36;

export interface Triage {
  score: number;
  bucket: Bucket;
  reason: string;
}

/**
 * Score one filing. `categoryReason` comes from the classifier so the UI can show a
 * single joined explanation for both the category and the bucket.
 */
export function triage(category: Category, text: string, categoryReason: string): Triage {
  const blob = text ?? "";
  let score = BASE[category];
  const notes: string[] = [];

  for (const m of MODIFIERS) {
    if (m.re.test(blob)) {
      score += m.delta;
      notes.push(`${m.delta > 0 ? "+" : ""}${m.delta} ${m.note}`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const bucket: Bucket = score >= ACT_AT ? "ACT" : score >= WATCH_AT ? "WATCH" : "NOISE";

  const reason = notes.length ? `${categoryReason} · ${notes.join(", ")}` : categoryReason;
  return { score, bucket, reason };
}

export const BUCKET_COPY: Record<Bucket, { label: string; blurb: string }> = {
  ACT: { label: "Act", blurb: "Needs a decision today" },
  WATCH: { label: "Watch", blurb: "Relevant, read when you can" },
  NOISE: { label: "Buried", blurb: "Routine filings, hidden by default" },
};
