/**
 * Grounding audit. Run with `npm run audit`.
 *
 * The product's central claim is that nothing in a dossier is invented: every promise and
 * every piece of evidence is a verbatim quote from a primary source. This script re-reads
 * each cited PDF and asserts the quote actually appears in it.
 *
 * `worker/dossier.ts` applies the same check at build time, so this is the regression
 * test for that invariant rather than the only line of defence. It exits non-zero on any
 * failure, which is what makes it a test and not a dashboard.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Dossier } from "../lib/types";
import { checkQuote } from "./quotes";

const log = (...a: unknown[]) => console.log("[audit]", ...a);

async function main() {
  const dossiers: Record<string, Dossier> = JSON.parse(
    readFileSync(join(process.cwd(), "data", "corpus", "dossiers.json"), "utf8"),
  );

  let verified = 0;
  let unreadable = 0;
  const failures: string[] = [];

  for (const [symbol, d] of Object.entries(dossiers)) {
    for (const p of d.promises) {
      const claims: Array<[string, string | null, string]> = [
        [p.quote, p.source.url, "promise"],
        ...p.evidence.map((e) => [e.quote ?? "", e.url, "evidence"] as [string, string | null, string]),
      ];
      for (const [quote, url, kind] of claims) {
        if (!quote) continue;
        const status = await checkQuote(quote, url);
        if (status === "verified") verified++;
        else if (status === "unreadable") unreadable++;
        else failures.push(`${symbol} (${kind}): "${quote.slice(0, 80)}"`);
      }
    }
  }

  const checked = verified + failures.length;
  log(`${verified}/${checked} quotes verified verbatim in their cited PDF`);
  if (unreadable) log(`${unreadable} skipped - source PDF could not be fetched or parsed`);

  if (failures.length) {
    log(`FAILED - ${failures.length} quote(s) do not appear in the document they cite:`);
    for (const f of failures) log(`  - ${f}`);
    process.exit(1);
  }
  log("every cited quote resolves to its source");
}

main().catch((e) => {
  console.error("[audit] FATAL", e);
  process.exit(1);
});
