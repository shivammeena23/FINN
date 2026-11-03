/**
 * Re-apply classification and triage to the existing corpus, without re-fetching.
 *
 * Triage rules are the part of this system most worth tuning, and refetching ~23MB from
 * NSE to test a regex change is wasteful. The raw NSE fields are preserved in the corpus,
 * so scoring is reproducible offline. Run with `npm run rescore`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../lib/categories";
import { triage } from "../lib/materiality";
import type { Announcement } from "../lib/types";

const FILE = join(process.cwd(), "data", "corpus", "announcements.json");

const payload = JSON.parse(readFileSync(FILE, "utf8")) as {
  generatedAt: string;
  windowDays: number;
  announcements: Announcement[];
};

const before = payload.announcements.reduce<Record<string, number>>((a, x) => {
  a[x.bucket] = (a[x.bucket] ?? 0) + 1;
  return a;
}, {});

let moved = 0;
for (const a of payload.announcements) {
  const { category, reason } = classify(a.nseDesc, a.text);
  const t = triage(category, `${a.nseDesc} ${a.text}`, reason);
  if (a.bucket !== t.bucket) moved++;
  a.category = category;
  a.bucket = t.bucket;
  a.score = t.score;
  a.reason = t.reason;
}

const after = payload.announcements.reduce<Record<string, number>>((a, x) => {
  a[x.bucket] = (a[x.bucket] ?? 0) + 1;
  return a;
}, {});

writeFileSync(FILE, JSON.stringify(payload, null, 0));
console.log(`[rescore] ${payload.announcements.length} filings, ${moved} changed bucket`);
console.log(`[rescore] before ACT=${before.ACT ?? 0} WATCH=${before.WATCH ?? 0} NOISE=${before.NOISE ?? 0}`);
console.log(`[rescore] after  ACT=${after.ACT ?? 0} WATCH=${after.WATCH ?? 0} NOISE=${after.NOISE ?? 0}`);
