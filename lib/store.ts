import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Announcement, Bar, Dossier } from "./types";

/**
 * Corpus reader. The single place the app gets push-side data.
 *
 * Stage 0 is a committed JSON corpus: zero infrastructure, and the deploy cannot fail
 * because a scrape failed. Everything below is deliberately behind one module so moving
 * to Postgres later is a change to this file alone, not to the app.
 */

const DIR = join(process.cwd(), "data", "corpus");

function read<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export interface DocLink {
  kind: "annual_report" | "transcript" | "ppt";
  label: string;
  url: string;
  period: string;
  sortKey: string;
}

let cache: {
  announcements: Announcement[];
  generatedAt: string;
  prices: Record<string, Bar[]>;
  docs: Record<string, DocLink[]>;
  dossiers: Record<string, Dossier>;
} | null = null;

/**
 * Companies routinely file the same disclosure twice (revisions, XBRL re-submissions).
 * The corpus keeps both because it is the raw record; the app shows the newest only,
 * otherwise the digest reads as if something happened twice.
 */
function dedupe(list: Announcement[]): Announcement[] {
  const seen = new Map<string, Announcement>();
  for (const a of list) {
    const key = `${a.symbol}|${a.nseDesc}|${a.text.slice(0, 160).toLowerCase()}`;
    const prev = seen.get(key);
    if (!prev || a.at > prev.at) seen.set(key, a);
  }
  return [...seen.values()].sort((x, y) => y.at.localeCompare(x.at));
}

function load() {
  if (cache) return cache;
  const ann = read<{ generatedAt: string; announcements: Announcement[] }>("announcements.json", {
    generatedAt: "",
    announcements: [],
  });
  const px = read<{ prices: Record<string, Bar[]> }>("prices.json", { prices: {} });
  const dc = read<{ docs: Record<string, DocLink[]> }>("docs.json", { docs: {} });
  const ds = read<Record<string, Dossier>>("dossiers.json", {});
  cache = {
    announcements: dedupe(ann.announcements),
    generatedAt: ann.generatedAt,
    prices: px.prices,
    docs: dc.docs,
    dossiers: ds,
  };
  return cache;
}

export function corpusGeneratedAt(): string {
  return load().generatedAt;
}

/** Announcements inside a rolling window, newest first. */
export function announcementsSince(hours: number): Announcement[] {
  const { announcements } = load();
  // The corpus is a historical snapshot, so "last 24h" is measured from the newest
  // filing we hold, not from wall-clock now. Otherwise the demo is empty on a Monday.
  const newest = announcements[0]?.at;
  if (!newest) return [];
  const cutoff = new Date(new Date(newest).getTime() - hours * 3_600_000).toISOString();
  return announcements.filter((a) => a.at >= cutoff);
}

export function allAnnouncements(): Announcement[] {
  return load().announcements;
}

export function announcementsFor(symbol: string): Announcement[] {
  return load().announcements.filter((a) => a.symbol === symbol.toUpperCase());
}

export function pricesFor(symbol: string): Bar[] {
  return load().prices[symbol.toUpperCase()] ?? [];
}

export function allPrices(): Record<string, Bar[]> {
  return load().prices;
}

export function docsFor(symbol: string): DocLink[] {
  return load().docs[symbol.toUpperCase()] ?? [];
}

export function dossierFor(symbol: string): Dossier | null {
  return load().dossiers[symbol.toUpperCase()] ?? null;
}

export function dossierSymbols(): string[] {
  return Object.keys(load().dossiers);
}
