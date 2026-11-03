/**
 * Ingestion worker. Run with `npm run ingest`.
 *
 * Produces data/corpus/*.json, which the deployed app reads. Nothing in the web app
 * ever scrapes NSE or screener.in on the push path - that keeps the demo fast and
 * immune to the datacenter-IP blocking both sources apply.
 *
 * This pass is Tier 0 of the model router: pure rules, zero tokens, zero cost.
 * `npm run enrich` adds the LLM layer on top.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../lib/categories";
import { triage } from "../lib/materiality";
import { PORTFOLIO, ADHOC } from "../lib/portfolio";
import type { Announcement, Bar, Company } from "../lib/types";
import {
  fetchAnnouncements,
  fetchPrices,
  fetchFundamentalDocs,
  type FundamentalDoc,
  type NseAnnouncement,
} from "./sources";

const OUT = join(process.cwd(), "data", "corpus");
const WINDOW_DAYS = Number(process.env.FINN_WINDOW_DAYS ?? 45);
/** NSE's date-ranged endpoint gets heavy past ~2 weeks, so page through it. */
const CHUNK_DAYS = 14;

const log = (...a: unknown[]) => console.log("[ingest]", ...a);

/** Parse NSE's "03-Nov-2026 14:02:59" (IST) into an ISO-8601 UTC instant. */
function parseNseDate(s: string): string | null {
  const m = s?.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const mon = months[m[2].toLowerCase()];
  if (mon === undefined) return null;
  // IST is UTC+5:30.
  const utcMs =
    Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - (5 * 60 + 30) * 60_000;
  return new Date(utcMs).toISOString();
}

async function collectAnnouncements(symbols: Set<string>): Promise<Announcement[]> {
  const now = new Date();
  const raw: NseAnnouncement[] = [];

  for (let offset = 0; offset < WINDOW_DAYS; offset += CHUNK_DAYS) {
    const to = new Date(now.getTime() - offset * 86_400_000);
    const from = new Date(
      now.getTime() - Math.min(offset + CHUNK_DAYS, WINDOW_DAYS) * 86_400_000,
    );
    log(`announcements ${from.toDateString()} -> ${to.toDateString()}`);
    const batch = await fetchAnnouncements(from, to);
    log(`  ${batch.length} filings across ${new Set(batch.map((b) => b.symbol)).size} symbols`);
    raw.push(...batch);
  }

  const byId = new Map<string, Announcement>();
  let skipped = 0;

  for (const r of raw) {
    if (!symbols.has(r.symbol)) continue;
    const at = parseNseDate(r.an_dt);
    if (!at) {
      skipped++;
      continue;
    }
    const text = (r.attchmntText ?? "").replace(/\s+/g, " ").trim();
    const { category, reason } = classify(r.desc, text);
    const t = triage(category, `${r.desc} ${text}`, reason);
    const id = `${r.symbol}-${r.seq_id ?? at}`;
    byId.set(id, {
      id,
      symbol: r.symbol,
      company: r.sm_name ?? r.symbol,
      at,
      nseDesc: r.desc ?? "",
      text,
      pdf: r.attchmntFile || null,
      category,
      bucket: t.bucket,
      score: t.score,
      reason: t.reason,
    });
  }

  if (skipped) log(`WARN ${skipped} filings dropped: unparseable date`);
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
}

async function collectPrices(companies: Company[]): Promise<Record<string, Bar[]>> {
  const out: Record<string, Bar[]> = {};
  for (const c of companies) {
    try {
      const bars = await fetchPrices(c.symbol, "1y");
      if (!bars.length) throw new Error("no bars returned");
      out[c.symbol] = bars;
      log(`prices ${c.symbol}: ${bars.length} bars, last ${bars.at(-1)!.date}`);
    } catch (e) {
      // Loud, not swallowed - a missing ticker is a data problem we need to see.
      log(`ERROR prices ${c.symbol}: ${String(e)}`);
    }
  }
  return out;
}

async function collectDocs(companies: Company[]): Promise<Record<string, FundamentalDoc[]>> {
  const out: Record<string, FundamentalDoc[]> = {};
  for (const c of companies) {
    try {
      const docs = await fetchFundamentalDocs(c.symbol);
      out[c.symbol] = docs;
      const t = docs.filter((d) => d.kind === "transcript").length;
      const a = docs.filter((d) => d.kind === "annual_report").length;
      log(`docs ${c.symbol}: ${t} transcripts, ${a} annual reports`);
      if (!t) log(`  WARN ${c.symbol} has no transcripts - Pull research will be thin`);
    } catch (e) {
      log(`ERROR docs ${c.symbol}: ${String(e)}`);
      out[c.symbol] = [];
    }
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const all = [...PORTFOLIO, ...ADHOC];
  const symbols = new Set(all.map((c) => c.symbol));

  const announcements = await collectAnnouncements(symbols);
  log(`kept ${announcements.length} filings for ${symbols.size} tracked symbols`);

  const counts = announcements.reduce<Record<string, number>>((acc, a) => {
    acc[a.bucket] = (acc[a.bucket] ?? 0) + 1;
    return acc;
  }, {});
  log(`triage: ACT=${counts.ACT ?? 0} WATCH=${counts.WATCH ?? 0} NOISE=${counts.NOISE ?? 0}`);

  const missing = [...symbols].filter((s) => !announcements.some((a) => a.symbol === s));
  if (missing.length) log(`NOTE no filings in window for: ${missing.join(", ")}`);

  const prices = await collectPrices(all);
  const docs = await collectDocs(all);

  writeFileSync(
    join(OUT, "announcements.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, announcements }, null, 0),
  );
  writeFileSync(
    join(OUT, "prices.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), prices }, null, 0),
  );
  writeFileSync(
    join(OUT, "docs.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), docs }, null, 0),
  );

  log(`wrote corpus to ${OUT}`);
}

main().catch((e) => {
  console.error("[ingest] FATAL", e);
  process.exit(1);
});
