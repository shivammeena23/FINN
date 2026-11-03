/** Domain types shared by the ingestion worker and the web app. */

/** The 17 announcement categories from ENAM's reference document. */
export type Category =
  | "results"
  | "M&A"
  | "fund_raise"
  | "management_change"
  | "litigation"
  | "insider_trading"
  | "earnings_call"
  | "investor_meetings"
  | "credit_rating"
  | "dividend"
  | "bonus_split"
  | "capex"
  | "press_release"
  | "postal_ballot"
  | "agm_egm"
  | "pledging"
  | "unclassified";

/** Triage bucket. The product's core opinion: most filings are NOISE and should be buried. */
export type Bucket = "ACT" | "WATCH" | "NOISE";

/** One corporate announcement, as ingested from NSE and enriched by us. */
export interface Announcement {
  id: string;
  symbol: string;
  company: string;
  /** ISO-8601 UTC. */
  at: string;
  /** NSE's own free-text label, kept so we never hide the primary source. */
  nseDesc: string;
  /** NSE's description of the attachment. */
  text: string;
  /** Direct link to the filing PDF on nsearchives. */
  pdf: string | null;
  category: Category;
  bucket: Bucket;
  /** 0-100. Drives ordering within a bucket. */
  score: number;
  /** How the bucket was decided - shown in the UI so triage is auditable, never a black box. */
  reason: string;
  /** LLM-written one-line judgement. Absent until the enrich pass runs. */
  why?: string;
  /** Headline numbers extracted from a results filing. */
  metrics?: ResultsMetrics;
  /** Background on an incoming executive, for management_change items. */
  bio?: PersonBio;
}

/** Revenue/EBITDA/PBT/PAT for a quarter, in INR crore. */
export interface QuarterMetrics {
  label: string;
  revenue: number | null;
  ebitda: number | null;
  pbt: number | null;
  pat: number | null;
}

export interface ResultsMetrics {
  current: QuarterMetrics;
  previousQuarter: QuarterMetrics | null;
  yearAgoQuarter: QuarterMetrics | null;
  /** Units the filing reported in, before we normalised. */
  sourceUnit: string;
  source: Citation;
}

export interface PersonBio {
  name: string;
  role: string;
  movement: "appointed" | "resigned" | "retired" | "deceased" | "other";
  background: string | null;
}

/** Every generated claim carries one of these. No citation, no render. */
export interface Citation {
  doc: string;
  url: string | null;
  /** Verbatim snippet from the primary source. */
  quote?: string;
  page?: number;
}

/** One end-of-day bar. */
export interface Bar {
  date: string;
  close: number;
  volume: number;
}

export interface PriceSeries {
  symbol: string;
  bars: Bar[];
}

/** User-configurable alert thresholds. The investor decides what "unusual" means. */
export interface AlertConfig {
  volumeMultiple: number;
  priceMovePct: number;
  categories: Category[];
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  volumeMultiple: 2,
  priceMovePct: 4,
  categories: ["results", "M&A", "management_change", "fund_raise", "litigation"],
};

export type SignalKind = "volume" | "price" | "category";

export interface Signal {
  id: string;
  kind: SignalKind;
  symbol: string;
  company: string;
  at: string;
  headline: string;
  detail: string;
  /** Signed percentage move, for price signals. */
  changePct?: number;
  /** Observed volume as a multiple of its trailing average. */
  volumeX?: number;
  announcementId?: string;
}

/** A single management promise matched against what was actually delivered. */
export interface Promise_ {
  /** What management said they would do, paraphrased tightly. */
  promise: string;
  /** Verbatim words from the transcript. */
  quote: string;
  madeOn: string;
  horizon: string;
  /** What the subsequent filings actually showed. */
  actual: string;
  verdict: "kept" | "partial" | "missed" | "too_early";
  evidence: Citation[];
  source: Citation;
}

export interface Dossier {
  symbol: string;
  company: string;
  generatedAt: string;
  snapshot: {
    business: string;
    segments: string[];
    headline: string;
    citations: Citation[];
  } | null;
  promises: Promise_[];
  bull: string[];
  bear: string[];
  sources: Citation[];
  /** Set when we could not reach primary sources for this ticker. */
  degraded?: string;
}

export interface Corpus {
  generatedAt: string;
  portfolio: Company[];
  announcements: Announcement[];
  prices: Record<string, Bar[]>;
}

export interface Company {
  symbol: string;
  name: string;
  sector: string;
}
