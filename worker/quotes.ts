/**
 * Quote verification.
 *
 * Asking a model not to fabricate quotes is a request. Checking its quotes against the
 * source document is an invariant. This module is the invariant: a quote that does not
 * appear in the PDF it cites never reaches the app.
 *
 * It catches a real failure mode - models paraphrase a document's facts into
 * quote-shaped sentences that were never spoken. The numbers are often right; the
 * quotation marks are a lie, and quotation marks are the whole basis of the product's
 * claim to be grounded.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PDF_CACHE = join(process.cwd(), ".cache", "pdf");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Strip punctuation and collapse whitespace so PDF line breaks do not cause false misses. */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export async function fetchPdf(url: string): Promise<Buffer | null> {
  mkdirSync(PDF_CACHE, { recursive: true });
  const path = join(PDF_CACHE, createHash("sha256").update(url).digest("hex").slice(0, 24) + ".pdf");
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

const textCache = new Map<string, string>();

/** Normalised full text of a cited PDF, or "" if it cannot be fetched or parsed. */
export async function sourceText(url: string): Promise<string> {
  if (textCache.has(url)) return textCache.get(url)!;
  const buf = await fetchPdf(url);
  if (!buf) {
    textCache.set(url, "");
    return "";
  }
  const realWarn = console.warn;
  console.warn = () => {}; // pdf.js is noisy about font tables in exchange-filed PDFs
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(doc, { mergePages: true });
    const out = norm(String(text));
    textCache.set(url, out);
    return out;
  } catch {
    textCache.set(url, "");
    return "";
  } finally {
    console.warn = realWarn;
  }
}

export type QuoteCheck = "verified" | "fabricated" | "unreadable";

/**
 * Does `quote` actually appear in the document at `url`?
 *
 * Matches on a distinctive interior window rather than the full string, so a trimmed
 * leading or trailing word does not read as a fabrication, while an invented sentence
 * still fails.
 */
export async function checkQuote(quote: string, url: string | null): Promise<QuoteCheck> {
  if (!quote?.trim() || !url) return "unreadable";
  const hay = await sourceText(url);
  if (!hay) return "unreadable";
  const words = norm(quote).split(" ").filter(Boolean);
  if (words.length < 4) return "unreadable";
  const probe = words.slice(2, 10).join(" ");
  return probe && hay.includes(probe) ? "verified" : "fabricated";
}
