import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tiered model router with a content-hash cache and a token ledger.
 *
 * The brief rewards spending less for the same result, so routing is explicit:
 *
 *   Tier 0  rules      ~75% of filings never reach a model at all (lib/categories.ts)
 *   Tier 1  flash-lite bulk one-line judgements, batched many filings per call
 *   Tier 2  flash-lite PDF -> structured numbers, native PDF input, no OCR pipeline
 *   Tier 3  flash+think the promised-vs-delivered reasoning, once per company
 *
 * Tier 3 was meant to be Pro. The free tier returns 429 for every Pro model, so Tier 3
 * is Flash with a raised thinking budget instead - which is the honest version of
 * "pick the right tool for each step" when the strongest tool is not on the menu.
 */

export const TIER = {
  bulk: "gemini-3.5-flash-lite",
  extract: "gemini-3.5-flash-lite",
  reason: "gemini-3.5-flash",
} as const;

/**
 * Published per-million-token rates, USD. Used only to put a notional figure on the
 * ledger - actual spend on the free tier is zero.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
};

const CACHE_DIR = join(process.cwd(), ".cache", "llm");
const LEDGER = join(process.cwd(), "data", "cost-report.json");

export interface LedgerEntry {
  model: string;
  calls: number;
  cached: number;
  inTokens: number;
  outTokens: number;
  thinkTokens: number;
  usd: number;
}

const ledger = new Map<string, LedgerEntry>();

function note(model: string, patch: Partial<LedgerEntry>) {
  const e =
    ledger.get(model) ??
    { model, calls: 0, cached: 0, inTokens: 0, outTokens: 0, thinkTokens: 0, usd: 0 };
  e.calls += patch.calls ?? 0;
  e.cached += patch.cached ?? 0;
  e.inTokens += patch.inTokens ?? 0;
  e.outTokens += patch.outTokens ?? 0;
  e.thinkTokens += patch.thinkTokens ?? 0;
  const r = RATES[model];
  if (r) {
    e.usd =
      (e.inTokens / 1e6) * r.in + ((e.outTokens + e.thinkTokens) / 1e6) * r.out;
  }
  ledger.set(model, e);
}

export function writeLedger() {
  const rows = [...ledger.values()];
  const total = rows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      cached: a.cached + r.cached,
      inTokens: a.inTokens + r.inTokens,
      outTokens: a.outTokens + r.outTokens,
      thinkTokens: a.thinkTokens + r.thinkTokens,
      usd: a.usd + r.usd,
    }),
    { calls: 0, cached: 0, inTokens: 0, outTokens: 0, thinkTokens: 0, usd: 0 },
  );
  const payload = { generatedAt: new Date().toISOString(), byModel: rows, total };
  writeFileSync(LEDGER, JSON.stringify(payload, null, 2));
  return payload;
}

export function ledgerSnapshot() {
  return [...ledger.values()];
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface CallOpts {
  model: string;
  parts: Part[];
  /** Raise for reasoning work; 0 disables thinking on models that support it. */
  thinking?: number;
  maxOutput?: number;
  /** When set, the model is asked for JSON and the result is parsed. */
  json?: boolean;
  /** Stable label for cache keys and logs. */
  label: string;
  /**
   * Models to drop down to if the primary is rate-limited or unavailable.
   * Free-tier quota is per-model, so a cheaper tier is usually still answering when the
   * stronger one is exhausted - a degraded answer beats an empty card.
   */
  fallbacks?: string[];
}

let client: any = null;
async function getClient() {
  if (client) return client;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set - copy .env.example to .env.local");
  const { GoogleGenAI } = await import("@google/genai");
  client = new GoogleGenAI({ apiKey: key });
  return client;
}

/** Hash the full request so an unchanged input never costs a second time. */
function cacheKey(o: CallOpts): string {
  const h = createHash("sha256");
  h.update(o.model);
  h.update(String(o.thinking ?? 0));
  h.update(o.json ? "json" : "text");
  for (const p of o.parts) {
    if ("text" in p) h.update(p.text);
    else h.update(p.inlineData.data.slice(0, 4096) + p.inlineData.data.length);
  }
  return h.digest("hex").slice(0, 32);
}

const RETRYABLE = /\b(429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand)\b/i;

/**
 * One model call, cached on disk by content hash.
 * Returns `null` rather than throwing when the model is unavailable, so one failed
 * enrichment degrades a single card instead of killing the whole run.
 */
export async function call(o: CallOpts): Promise<string | null> {
  for (const model of [o.model, ...(o.fallbacks ?? [])]) {
    const text = await callOne({ ...o, model });
    if (text !== null) return text;
    if (model !== (o.fallbacks ?? []).at(-1) && (o.fallbacks ?? []).length) {
      console.log(`  [gemini] ${o.label}: falling back from ${model}`);
    }
  }
  return null;
}

async function callOne(o: CallOpts): Promise<string | null> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(o);
  const path = join(CACHE_DIR, `${key}.json`);

  if (existsSync(path)) {
    try {
      const hit = JSON.parse(readFileSync(path, "utf8"));
      note(o.model, { cached: 1 });
      return hit.text as string;
    } catch {
      /* corrupt cache entry - fall through and re-call */
    }
  }

  const ai = await getClient();
  const config: Record<string, unknown> = { maxOutputTokens: o.maxOutput ?? 8000 };
  // These models reject thinkingBudget: 0 outright (400 INVALID_ARGUMENT); 128 is the
  // floor. Asking for "no thinking" therefore means "as little as the API allows".
  if (o.thinking !== undefined) {
    config.thinkingConfig = { thinkingBudget: o.thinking <= 0 ? 128 : o.thinking };
  }
  if (o.json) config.responseMimeType = "application/json";

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: o.model,
        contents: [{ role: "user", parts: o.parts }],
        config,
      });
      const text = r.text ?? "";
      const u = r.usageMetadata ?? {};
      note(o.model, {
        calls: 1,
        inTokens: u.promptTokenCount ?? 0,
        outTokens: u.candidatesTokenCount ?? 0,
        thinkTokens: u.thoughtsTokenCount ?? 0,
      });
      writeFileSync(path, JSON.stringify({ label: o.label, text }));
      return text;
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e);
      if (attempt < 3 && RETRYABLE.test(msg)) {
        const wait = 2500 * (attempt + 1);
        console.log(`  [gemini] ${o.label}: ${msg.slice(0, 70)} - retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.log(`  [gemini] ${o.label} FAILED: ${msg.slice(0, 160)}`);
      return null;
    }
  }
  return null;
}

/** Parse a JSON response defensively - models occasionally wrap JSON in prose. */
export function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, ""),
    trimmed.slice(trimmed.search(/[[{]/)),
  ];
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}
