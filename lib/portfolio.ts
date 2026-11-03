import type { Company } from "./types";

/**
 * A mock portfolio of 18 NSE-listed companies, spread across sectors and market caps
 * so the digest has variety to triage.
 *
 * Every symbol here was validated against both the live NSE announcement feed and
 * Yahoo EOD before being committed - which is how we caught that ZOMATO is now ETERNAL
 * and that TATAMOTORS has split into TMCV (commercial) and TMPV (passenger).
 */
export const PORTFOLIO: Company[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Conglomerate" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys", sector: "IT Services" },
  { symbol: "TMCV", name: "Tata Motors", sector: "Automobiles" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Capital Goods" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Automobiles" },
  { symbol: "ITC", name: "ITC", sector: "FMCG" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paints" },
  { symbol: "TRENT", name: "Trent", sector: "Retail" },
  { symbol: "POLYCAB", name: "Polycab India", sector: "Electricals" },
  { symbol: "DIXON", name: "Dixon Technologies", sector: "Electronics Mfg" },
  { symbol: "ETERNAL", name: "Eternal (Zomato)", sector: "Internet" },
  { symbol: "DEEPAKNTR", name: "Deepak Nitrite", sector: "Chemicals" },
  { symbol: "KPITTECH", name: "KPIT Technologies", sector: "Auto Tech" },
  { symbol: "CAMS", name: "Computer Age Mgmt", sector: "Financial Infra" },
  { symbol: "PERSISTENT", name: "Persistent Systems", sector: "IT Services" },
];

/**
 * Companies outside the portfolio, used to demo that Pull research generalises.
 * The research engine is not wired to this list - it works on any NSE symbol.
 */
export const ADHOC: Company[] = [
  { symbol: "ASTRAL", name: "Astral", sector: "Building Materials" },
  { symbol: "NYKAA", name: "FSN E-Commerce (Nykaa)", sector: "Internet Retail" },
  { symbol: "AFFLE", name: "Affle 3i", sector: "Adtech" },
  { symbol: "SUPREMEIND", name: "Supreme Industries", sector: "Plastics" },
  { symbol: "NAUKRI", name: "Info Edge", sector: "Internet" },
];

const BY_SYMBOL = new Map([...PORTFOLIO, ...ADHOC].map((c) => [c.symbol, c]));

export function lookup(symbol: string): Company | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function isInPortfolio(symbol: string): boolean {
  return PORTFOLIO.some((c) => c.symbol === symbol.toUpperCase());
}
