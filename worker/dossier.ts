/**
 * Pull-side research. Run with `npm run dossier [SYMBOL ...]`.
 *
 * Builds the "promised vs delivered" ledger the brief calls out as the thing it values
 * most: take management's own forward-looking statements from past earnings calls, then
 * check them against what the company subsequently reported.
 *
 * Grounding discipline: the only inputs are the company's own concall transcripts and
 * the figures we extracted from its own results filings. No news, no broker notes, and
 * the prompts forbid the model from leaning on what it already knows about the company.
 * Every claim carries a citation back to a specific transcript.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { TIER, call, parseJson, writeLedger } from "../lib/gemini";
import type { Announcement, Citation, Dossier, Promise_ } from "../lib/types";
import { lookup } from "../lib/portfolio";

const CORPUS = join(process.cwd(), "data", "corpus");
const OUT = join(CORPUS, "dossiers.json");
const PDF_CACHE = join(process.cwd(), ".cache", "pdf");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...a: unknown[]) => console.log("[dossier]", ...a);

interface DocLink {
  kind: string;
  label: string;
  url: string;
  period: string;
  sortKey: string;
}

const docs: Record<string, DocLink[]> = JSON.parse(
  readFileSync(join(CORPUS, "docs.json"), "utf8"),
).docs;
const announcements: Announcement[] = JSON.parse(
  readFileSync(join(CORPUS, "announcements.json"), "utf8"),
).announcements;

/** Transcripts are re-read across runs; cache the bytes so we re-download nothing. */
async function getPdf(url: string): Promise<Buffer | null> {
  mkdirSync(PDF_CACHE, { recursive: true });
  const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const path = join(PDF_CACHE, `${key}.pdf`);
  if (existsSync(path)) {
    const b = readFileSync(path);
    if (b.subarray(0, 4).toString() === "%PDF") return b;
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/" },
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "%PDF") return null;
    if (buf.length > 14 * 1024 * 1024) return null;
    writeFileSync(path, buf);
    return buf;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------- pass A: promises */

const PROMISE_PROMPT = `You are reading ONE earnings-call transcript of an Indian listed company.

Find every EXPLICIT forward-looking commitment management made on the call. A commitment is a
statement about what the company WILL do or expects to achieve - growth, margins, capex, capacity,
launches, debt reduction, deal closure, timelines.

Strict rules:
- Quote verbatim from this transcript. If you cannot quote it, do not include it.
- Only management's own words (CEO/CFO/MD/executives). Never an analyst's question or assumption.
- Ignore vague sentiment ("we are confident", "we feel good"). Require something checkable.
- "horizon" = the timeframe management gave, e.g. "FY27", "next 2 quarters", "H2". Use "unspecified" if none.
- Use ONLY this document. Do not use anything you know about this company from elsewhere.

Return at most 6, the most consequential first.
JSON: [{"promise":"<=20 words, what they committed to","quote":"verbatim","horizon":""}]`;

async function extractPromises(symbol: string, doc: DocLink) {
  const buf = await getPdf(doc.url);
  if (!buf) {
    log(`  ${symbol} ${doc.period}: transcript unavailable`);
    return [];
  }
  const out = await call({
    model: TIER.extract,
    label: `promises-${symbol}-${doc.sortKey}`,
    json: true,
    thinking: 3000,
    maxOutput: 4000,
    parts: [
      { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
      { text: PROMISE_PROMPT },
    ],
  });
  const parsed = parseJson<Array<{ promise: string; quote: string; horizon: string }>>(out) ?? [];
  const rows = parsed.filter((p) => p?.promise && p?.quote);
  log(`  ${symbol} ${doc.period}: ${rows.length} commitments`);
  return rows.map((p) => ({ ...p, period: doc.period, url: doc.url, sortKey: doc.sortKey }));
}

/* --------------------------------------------------------- pass B: adjudicate */

const VERDICT_PROMPT = `You are auditing an Indian listed company's management against its own words.

You are given:
1. Commitments management made on EARLIER earnings calls, each with the quarter it was made in.
2. The MOST RECENT earnings-call transcript (attached as a PDF).
3. Reported figures from the company's own results filings, in INR crore.

For each commitment, decide what actually happened, using ONLY the attached transcript and the
reported figures supplied. Do not use outside knowledge, news or analyst commentary.

verdict:
  "kept"      - evidence shows it was delivered
  "partial"   - partly delivered, or delivered late / below the stated level
  "missed"    - evidence shows it was not delivered
  "too_early" - the horizon has not elapsed yet, or the documents simply do not say

Be strict. "too_early" is the correct answer whenever the evidence does not actually settle it -
do not guess, and do not mark something "kept" merely because management sounds positive.

"actual" = one line (max 25 words) stating what the evidence shows. Quote a figure where you have one.

Return JSON keyed by the index you were given:
[{"i":<index>,"verdict":"kept|partial|missed|too_early","actual":"","evidence_quote":"verbatim from the attached transcript, or empty"}]`;

async function adjudicate(
  symbol: string,
  promises: Array<{ promise: string; quote: string; horizon: string; period: string; url: string }>,
  latest: DocLink,
  metrics: string,
) {
  const buf = await getPdf(latest.url);
  if (!buf) return null;

  const listing = promises
    .map((p, i) => `${i}. [said in ${p.period}, horizon ${p.horizon || "unspecified"}] ${p.promise}\n   quote: "${p.quote.slice(0, 260)}"`)
    .join("\n");

  const out = await call({
    model: TIER.reason,
    fallbacks: [TIER.bulk],
    label: `verdict-${symbol}-${latest.sortKey}`,
    json: true,
    thinking: 8000, // the only place in the pipeline that gets a real reasoning budget
    maxOutput: 6000,
    parts: [
      { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
      { text: `${VERDICT_PROMPT}\n\nReported figures:\n${metrics || "(none extracted)"}\n\nCommitments:\n${listing}` },
    ],
  });

  return parseJson<Array<{ i: number; verdict: Promise_["verdict"]; actual: string; evidence_quote: string }>>(out);
}

/* ------------------------------------------------------------------ snapshot */

const SNAPSHOT_PROMPT = `From this earnings-call transcript only, describe the company for an investor
who has never heard of it.

- "business": 2 sentences on what it actually sells and how it makes money.
- "segments": the business lines named on the call (max 5, as named).
- "headline": one line on how the quarter went, with a figure if one is stated.
- "bull" / "bear": 2 short points each, drawn strictly from what was said on THIS call -
  bull from what is working, bear from what management or analysts flagged as a problem.

Use only this document. No outside knowledge.
JSON: {"business":"","segments":[],"headline":"","bull":["",""],"bear":["",""]}`;

async function snapshot(symbol: string, latest: DocLink) {
  const buf = await getPdf(latest.url);
  if (!buf) return null;
  const out = await call({
    model: TIER.extract,
    label: `snapshot-${symbol}-${latest.sortKey}`,
    json: true,
    thinking: 2500,
    maxOutput: 3000,
    parts: [
      { inlineData: { mimeType: "application/pdf", data: buf.toString("base64") } },
      { text: SNAPSHOT_PROMPT },
    ],
  });
  return parseJson<{
    business: string;
    segments: string[];
    headline: string;
    bull: string[];
    bear: string[];
  }>(out);
}

/* ---------------------------------------------------------------------- main */

/** Reported figures, formatted compactly so the reasoning pass can check claims. */
function metricsFor(symbol: string): string {
  const rows = announcements.filter((a) => a.symbol === symbol && a.metrics);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const a of rows) {
    const m = a.metrics!;
    for (const q of [m.current, m.previousQuarter, m.yearAgoQuarter]) {
      if (!q || seen.has(q.label)) continue;
      seen.add(q.label);
      lines.push(
        `${q.label}: revenue ${q.revenue ?? "?"}, ebitda ${q.ebitda ?? "?"}, pbt ${q.pbt ?? "?"}, pat ${q.pat ?? "?"}`,
      );
    }
  }
  return lines.join("\n");
}

export async function buildDossier(symbol: string, maxCalls = 4): Promise<Dossier> {
  const sym = symbol.toUpperCase();
  const company = lookup(sym)?.name ?? sym;
  const transcripts = (docs[sym] ?? [])
    .filter((d) => d.kind === "transcript")
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const base: Dossier = {
    symbol: sym,
    company,
    generatedAt: new Date().toISOString(),
    snapshot: null,
    promises: [],
    bull: [],
    bear: [],
    sources: [],
  };

  if (transcripts.length < 2) {
    return {
      ...base,
      degraded: `Only ${transcripts.length} concall transcript${transcripts.length === 1 ? "" : "s"} available for ${sym}. Promised-vs-delivered needs at least two calls.`,
    };
  }

  const latest = transcripts[0];
  // Earlier calls supply the promises; the newest call supplies the evidence.
  const earlier = transcripts.slice(1, maxCalls);

  const collected: Array<{
    promise: string; quote: string; horizon: string; period: string; url: string; sortKey: string;
  }> = [];
  for (const d of earlier) collected.push(...(await extractPromises(sym, d)));

  if (!collected.length) {
    return { ...base, degraded: `No explicit commitments found in ${sym}'s earlier calls.` };
  }

  const snap = await snapshot(sym, latest);
  const verdicts = await adjudicate(sym, collected, latest, metricsFor(sym));

  // If adjudication never ran, every row would silently fall back to "open" and the
  // ledger would look adjudicated when it is not. Say so instead.
  const adjudicationFailed = verdicts === null;

  const promises: Promise_[] = collected.map((p, i) => {
    const v = verdicts?.find((x) => x.i === i);
    const evidence: Citation[] = [];
    if (v?.evidence_quote) {
      evidence.push({ doc: `Concall transcript ${latest.period}`, url: latest.url, quote: v.evidence_quote });
    }
    return {
      promise: p.promise,
      quote: p.quote,
      madeOn: p.period,
      horizon: p.horizon || "unspecified",
      actual: v?.actual ?? "Not addressed in the latest call.",
      verdict: v?.verdict ?? "too_early",
      evidence,
      source: { doc: `Concall transcript ${p.period}`, url: p.url, quote: p.quote },
    };
  });

  const order = { missed: 0, partial: 1, kept: 2, too_early: 3 } as const;
  promises.sort((a, b) => order[a.verdict] - order[b.verdict]);

  return {
    ...base,
    degraded: adjudicationFailed
      ? `Extracted ${promises.length} commitments for ${sym}, but the adjudication pass could not run (model unavailable). Verdicts below are not graded.`
      : undefined,
    snapshot: snap
      ? {
          business: snap.business,
          segments: snap.segments ?? [],
          headline: snap.headline,
          citations: [{ doc: `Concall transcript ${latest.period}`, url: latest.url }],
        }
      : null,
    promises,
    bull: snap?.bull ?? [],
    bear: snap?.bear ?? [],
    sources: [latest, ...earlier].map((d) => ({ doc: `Concall transcript ${d.period}`, url: d.url })),
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = args.length ? args : ["RELIANCE", "DIXON", "ASIANPAINT", "KPITTECH", "DEEPAKNTR", "ASTRAL"];

  const existing: Record<string, Dossier> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  for (const t of targets) {
    log(`building ${t}`);
    try {
      const d = await buildDossier(t);
      existing[d.symbol] = d;
      log(`  ${t}: ${d.promises.length} promises${d.degraded ? ` (degraded: ${d.degraded})` : ""}`);
      writeFileSync(OUT, JSON.stringify(existing, null, 0));
    } catch (e) {
      log(`  ${t} FAILED: ${String(e).slice(0, 160)}`);
    }
  }

  const ledger = writeLedger();
  log(`--- cost ledger: this run ~${ledger.total.usd.toFixed(4)}, cumulative ~${ledger.cumulative.usd.toFixed(4)} ---`);
  for (const r of ledger.byModel) {
    log(`  ${r.model}: ${r.calls} calls (${r.cached} cached) in=${r.inTokens} out=${r.outTokens} think=${r.thinkTokens} ~$${r.usd.toFixed(4)}`);
  }
}

if (process.argv[1]?.includes("dossier")) {
  main().catch((e) => {
    console.error("[dossier] FATAL", e);
    process.exit(1);
  });
}
