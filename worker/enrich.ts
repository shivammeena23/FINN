/**
 * Enrichment pass. Run with `npm run enrich` after `npm run ingest`.
 *
 * Adds the LLM layer on top of the rules corpus:
 *   Tier 1  one-line "why it matters" for surfaced filings, batched 25 at a time
 *   Tier 2  Revenue/EBITDA/PBT/PAT from results PDFs, with QoQ and YoY
 *   Tier 2  a short background on incoming executives for management changes
 *
 * Buried filings are never sent to a model. That is the whole point of Tier 0: you do
 * not pay to summarise paperwork you have already decided not to show.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TIER, call, parseJson, writeLedger } from "../lib/gemini";
import type { Announcement, QuarterMetrics } from "../lib/types";

const FILE = join(process.cwd(), "data", "corpus", "announcements.json");
const BATCH = 25;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...a: unknown[]) => console.log("[enrich]", ...a);

const payload = JSON.parse(readFileSync(FILE, "utf8")) as {
  generatedAt: string;
  windowDays: number;
  announcements: Announcement[];
};

/* ------------------------------------------------------------------ Tier 1 */

const WHY_SYSTEM = `You advise a professional investor who already understands finance.
For each numbered filing, write ONE line (max 22 words) saying why it matters to someone holding the stock.

Rules:
- State the implication, not a summary. "Margin guidance cut for the second straight quarter" beats "Company announced results".
- If the filing text is too thin to judge, say what to check instead, e.g. "Detail is in the attachment - check deal size".
- No hype, no hedging, no "this could potentially". No trailing period.
- Never invent numbers, names or outcomes that are not in the text you were given.

Return JSON: [{"i": <number>, "why": "<line>"}]`;

async function tier1(items: Announcement[]) {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const listing = batch
      .map((a, n) => `${n + 1}. [${a.symbol} | ${a.category}] ${a.nseDesc}: ${a.text.slice(0, 320)}`)
      .join("\n");

    const out = await call({
      model: TIER.bulk,
      label: `why-${i}`,
      json: true,
      thinking: 0, // judgement from given text only - no reasoning budget needed
      maxOutput: 4000,
      parts: [{ text: `${WHY_SYSTEM}\n\nFilings:\n${listing}` }],
    });

    const parsed = parseJson<Array<{ i: number; why: string }>>(out);
    if (!parsed) {
      log(`  batch ${i / BATCH + 1}: no parseable response, leaving ${batch.length} unenriched`);
      continue;
    }
    for (const row of parsed) {
      const target = batch[row.i - 1];
      if (target && typeof row.why === "string" && row.why.trim()) {
        target.why = row.why.trim().replace(/\.$/, "");
      }
    }
    log(`  batch ${i / BATCH + 1}/${Math.ceil(items.length / BATCH)}: ${parsed.length} judgements`);
  }
}

/* ------------------------------------------------------------------ Tier 2 */

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://www.nseindia.com/" },
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") return null;
    // Inline PDF input caps out well below this; big annual reports are not worth it here.
    if (buf.length > 14 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}

const METRICS_PROMPT = `You are reading an Indian listed company's quarterly results filing.

Extract the CONSOLIDATED figures if present, else standalone. Report in INR crore.
If the statement is in lakhs, divide by 100. If in millions, multiply by 0.1. Do not guess.

Find three columns if the filing shows them:
- current: the quarter this filing reports
- previousQuarter: the immediately preceding quarter
- yearAgoQuarter: the same quarter one year earlier

EBITDA is usually not stated. Compute it only as:
  (Profit before tax) + (Finance costs) + (Depreciation and amortisation) - (Other income)
If any component is missing, return null for ebitda rather than approximating.

Return JSON:
{"sourceUnit":"crore|lakh|million","current":{"label":"Q2 FY27","revenue":n,"ebitda":n,"pbt":n,"pat":n},
 "previousQuarter":{...}|null,"yearAgoQuarter":{...}|null}

Use null for any figure not clearly present. Never infer a number that is not printed.`;

async function tier2Metrics(items: Announcement[]) {
  let done = 0;
  for (const a of items) {
    if (!a.pdf) continue;
    if (a.metrics && !process.env.FINN_REDO) continue; // already extracted on an earlier run
    const buf = await download(a.pdf);
    if (!buf) {
      log(`  ${a.symbol}: results PDF unavailable, skipping metrics`);
      continue;
    }
    // A board-meeting cover letter is a page or two; a results statement with a P&L is
    // not. Skipping the small ones avoids paying to read "please find enclosed".
    if (buf.length < 60_000) {
      log(`  ${a.symbol}: ${(buf.length / 1024).toFixed(0)}KB PDF looks like a cover letter, skipping`);
      continue;
    }
    const out = await call({
      model: TIER.extract,
      label: `metrics-${a.id}`,
      json: true,
      thinking: 2500,
      maxOutput: 3000,
      parts: [
        { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
        { text: METRICS_PROMPT },
      ],
    });

    const parsed = parseJson<{
      sourceUnit: string;
      current: QuarterMetrics;
      previousQuarter: QuarterMetrics | null;
      yearAgoQuarter: QuarterMetrics | null;
    }>(out);

    if (!parsed?.current || parsed.current.revenue == null) {
      log(`  ${a.symbol}: no usable figures in ${a.pdf.split("/").pop()}`);
      continue;
    }

    a.metrics = {
      current: parsed.current,
      previousQuarter: parsed.previousQuarter ?? null,
      yearAgoQuarter: parsed.yearAgoQuarter ?? null,
      sourceUnit: parsed.sourceUnit ?? "crore",
      source: { doc: "Quarterly results filing", url: a.pdf },
    };
    done++;
    log(`  ${a.symbol} ${parsed.current.label}: rev ${parsed.current.revenue} pat ${parsed.current.pat}`);
  }
  log(`metrics extracted for ${done}/${items.length} results filings`);
}

const BIO_PROMPT = `An Indian listed company filed this management-change announcement.

Identify the single most senior person whose role is CHANGING, and summarise their professional
background in at most 28 words - where they worked before, what they are known for.

If the filing names an incoming person, prefer them over the departing one.
Set "background" to null if you do not reliably know this person. Do not guess a career.

Return JSON: {"name":"","role":"","movement":"appointed|resigned|retired|deceased|other","background":""|null}`;

async function tier2Bios(items: Announcement[]) {
  let done = 0;
  for (const a of items) {
    const out = await call({
      model: TIER.extract,
      label: `bio-${a.id}`,
      json: true,
      thinking: 800,
      maxOutput: 1200,
      parts: [{ text: `${BIO_PROMPT}\n\nFiling: ${a.company}\n${a.nseDesc}: ${a.text.slice(0, 900)}` }],
    });
    const parsed = parseJson<NonNullable<Announcement["bio"]>>(out);
    if (parsed?.name) {
      a.bio = parsed;
      done++;
    }
  }
  log(`bios resolved for ${done}/${items.length} management changes`);
}

/* -------------------------------------------------------------------- main */

async function main() {
  const all = payload.announcements;
  const surfaced = all.filter((a) => a.bucket !== "NOISE");

  // Not every "results" filing carries the financial statements - decks, press releases
  // and board-outcome letters share the category. Send the model the ones most likely to
  // contain a P&L, so we do not pay to read a slide deck looking for EBITDA.
  const results = surfaced
    .filter((a) => a.category === "results" && a.pdf)
    .filter((a) => !/presentation|press release|newspaper|audio|transcript/i.test(`${a.nseDesc} ${a.text}`))
    .map((a) => ({
      a,
      rank:
        (/financial results|statement of (standalone|consolidated)/i.test(a.text) ? 2 : 0) +
        (/result/i.test(a.pdf ?? "") ? 1 : 0),
    }))
    .sort((x, y) => y.rank - x.rank || y.a.at.localeCompare(x.a.at))
    .map((x) => x.a);
  const mgmt = surfaced.filter((a) => a.category === "management_change");

  log(`${all.length} filings total, ${surfaced.length} surfaced (${all.length - surfaced.length} never sent to a model)`);

  log(`Tier 1: one-line judgements for ${surfaced.length} filings`);
  await tier1(surfaced);

  // Cap the PDF work: this is a demo corpus, and each call reads a whole filing.
  const resultsSlice = results.slice(0, Number(process.env.FINN_MAX_RESULTS ?? 20));
  log(`Tier 2: metrics from ${resultsSlice.length} results filings`);
  await tier2Metrics(resultsSlice);

  const mgmtSlice = mgmt.slice(0, Number(process.env.FINN_MAX_BIOS ?? 15));
  log(`Tier 2: backgrounds for ${mgmtSlice.length} management changes`);
  await tier2Bios(mgmtSlice);

  writeFileSync(FILE, JSON.stringify(payload, null, 0));

  const ledger = writeLedger();
  log("--- cost ledger ---");
  for (const r of ledger.byModel) {
    log(`  ${r.model}: ${r.calls} calls (${r.cached} cached) in=${r.inTokens} out=${r.outTokens} think=${r.thinkTokens} ~$${r.usd.toFixed(4)}`);
  }
  log(`  TOTAL ~$${ledger.total.usd.toFixed(4)} across ${ledger.total.calls} live calls`);
}

main().catch((e) => {
  console.error("[enrich] FATAL", e);
  process.exit(1);
});
