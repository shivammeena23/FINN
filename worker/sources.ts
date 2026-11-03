/**
 * Thin clients for the three primary sources. Deliberately plain `fetch` - every source
 * turned out to be either JSON or HTML over plain HTTP, so there is no scraping framework
 * and no Python here.
 *
 * These run from a residential IP (your machine or a GitHub Actions runner), never from
 * the deployed app: NSE and screener.in both throttle datacenter traffic, and the demo
 * must not depend on a live scrape succeeding.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSERISH = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface NseAnnouncement {
  symbol: string;
  sm_name: string;
  desc: string;
  attchmntText: string;
  attchmntFile: string;
  an_dt: string;
  sort_date: string;
  seq_id: string;
}

/** Retry with backoff. NSE occasionally returns an empty body or a challenge page. */
async function getText(url: string, tries = 3, timeoutMs = 90_000): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { headers: BROWSERISH, signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!body.trim()) throw new Error("empty body");
      return body;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw new Error(`fetch failed after ${tries} tries: ${url} :: ${String(lastErr)}`);
}

async function getJson<T>(url: string, tries = 3): Promise<T> {
  const body = await getText(url, tries);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`non-JSON response from ${url}: ${body.slice(0, 120)}`);
  }
}

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

/**
 * All equity announcements in a date window, in ONE call.
 *
 * This is the efficiency win on the push side: a single ~5MB request covers every listed
 * company, so adding a stock to the portfolio costs zero extra requests. We filter to the
 * portfolio locally.
 */
export async function fetchAnnouncements(from: Date, to: Date): Promise<NseAnnouncement[]> {
  const url =
    `https://www.nseindia.com/api/corporate-announcements?index=equities` +
    `&from_date=${ddmmyyyy(from)}&to_date=${ddmmyyyy(to)}`;
  const data = await getJson<NseAnnouncement[]>(url);
  if (!Array.isArray(data)) throw new Error("NSE returned a non-array payload");
  return data;
}

/** Announcements for a single symbol - used by the on-demand Pull path for any ticker. */
export async function fetchAnnouncementsFor(
  symbol: string,
  from: Date,
  to: Date,
): Promise<NseAnnouncement[]> {
  const url =
    `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}` +
    `&from_date=${ddmmyyyy(from)}&to_date=${ddmmyyyy(to)}`;
  const data = await getJson<NseAnnouncement[]>(url);
  return Array.isArray(data) ? data : [];
}

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
  };
}

export interface YahooBar {
  date: string;
  close: number;
  volume: number;
}

/** End-of-day closes and volumes. Yahoo's chart endpoint is plain JSON - no API key. */
export async function fetchPrices(symbol: string, range = "1y"): Promise<YahooBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=${range}&interval=1d`;
  const j = await getJson<YahooChart>(url);
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) return [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const vols: (number | null)[] = r.indicators?.quote?.[0]?.volume ?? [];
  const out: YahooBar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i];
    const v = vols[i];
    if (c == null) continue;
    out.push({
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
      close: Math.round(c * 100) / 100,
      volume: v ?? 0,
    });
  }
  return out;
}

export interface FundamentalDoc {
  kind: "annual_report" | "transcript" | "ppt";
  label: string;
  url: string;
  /** "Nov 2026" for concalls, "2026" for annual reports. Drives chronological ordering. */
  period: string;
  /** Sortable YYYY-MM derived from `period`. */
  sortKey: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toSortKey(period: string): string {
  const m = period.match(/([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m) return `${m[2]}-${MONTHS[m[1].toLowerCase()] ?? "01"}`;
  const y = period.match(/(\d{4})/);
  return y ? `${y[1]}-12` : "0000-00";
}

/**
 * Annual reports and concall transcripts from screener.in.
 *
 * screener.in consolidates links to the company's own primary documents; we follow those
 * links to the issuer/BSE PDFs rather than reading screener's own commentary, which keeps
 * the pull side on primary sources as the brief requires.
 */
export async function fetchFundamentalDocs(symbol: string): Promise<FundamentalDoc[]> {
  const cheerio = await import("cheerio");
  let html: string;
  try {
    html = await getText(`https://www.screener.in/company/${symbol}/`, 2, 45_000);
  } catch {
    // Consolidated (banks, some large caps) live at a different path.
    html = await getText(`https://www.screener.in/company/${symbol}/consolidated/`, 2, 45_000);
  }
  const $ = cheerio.load(html);
  const docs: FundamentalDoc[] = [];
  const seen = new Set<string>();

  const push = (kind: FundamentalDoc["kind"], label: string, period: string, href?: string) => {
    if (!href || href.startsWith("#")) return;
    const url = href.startsWith("http") ? href : `https://www.screener.in${href}`;
    if (seen.has(url)) return;
    seen.add(url);
    docs.push({
      kind,
      label: label.replace(/\s+/g, " ").trim(),
      url,
      period,
      sortKey: toSortKey(period),
    });
  };

  $("div.documents").each((_, section) => {
    const heading = $(section).find("h3").first().text().trim();

    // Annual reports: the year lives in the link text ("Annual Report 2026").
    if (/annual/i.test(heading)) {
      $(section)
        .find("li a")
        .each((__, a) => {
          const text = $(a).text().replace(/\s+/g, " ").trim();
          if (!/annual report/i.test(text)) return;
          push("annual_report", text, text.match(/(\d{4})/)?.[1] ?? "", $(a).attr("href"));
        });
      return;
    }

    // Concalls: each <li> holds a period div plus Transcript / PPT / REC chips.
    if (/concall/i.test(heading)) {
      $(section)
        .find("li")
        .each((__, li) => {
          const period = $(li).children("div").first().text().replace(/\s+/g, " ").trim();
          $(li)
            .find("a")
            .each((___, a) => {
              const text = $(a).text().trim();
              const href = $(a).attr("href");
              // Only the raw transcript PDF is a primary source. REC is YouTube; PPT is a deck.
              if (/^transcript$/i.test(text)) push("transcript", `Concall transcript ${period}`, period, href);
              else if (/^ppt$/i.test(text)) push("ppt", `Investor presentation ${period}`, period, href);
            });
        });
    }
  });

  docs.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return docs;
}
