import Link from "next/link";
import { notFound } from "next/navigation";
import { PromiseLedger } from "@/components/PromiseLedger";
import { Sparkline } from "@/components/Sparkline";
import { FilingCard } from "@/components/FilingCard";
import { announcementsFor, docsFor, dossierFor, pricesFor, allAnnouncements } from "@/lib/store";
import { lookup } from "@/lib/portfolio";

export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).toUpperCase();
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) notFound();

  const dossier = dossierFor(symbol);
  const bars = pricesFor(symbol);
  const filings = announcementsFor(symbol).filter((a) => a.bucket !== "NOISE").slice(0, 6);
  const docs = docsFor(symbol);
  const company = dossier?.company ?? lookup(symbol)?.name ?? symbol;
  const now = allAnnouncements()[0]?.at ?? new Date().toISOString();

  const transcripts = docs.filter((d) => d.kind === "transcript").slice(0, 4);
  const reports = docs.filter((d) => d.kind === "annual_report").slice(0, 3);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl"
        style={{ borderColor: "var(--line-soft)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
      >
        <Link href="/research" className="text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
          ← Research
        </Link>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight">{symbol}</h1>
        <p className="mt-1.5 truncate text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
          {company}
        </p>
      </header>

      <main className="px-4 pb-6">
        {bars.length > 1 && (
          <div className="card mt-4 px-3 pb-2 pt-3">
            <Sparkline bars={bars} />
          </div>
        )}

        {dossier?.snapshot && (
          <section className="mt-4">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
              Snapshot
            </h2>
            <div className="card p-3.5">
              <p className="text-[13px] leading-[1.5]">{dossier.snapshot.business}</p>
              {dossier.snapshot.segments.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {dossier.snapshot.segments.map((s) => (
                    <span key={s} className="chip">{s}</span>
                  ))}
                </div>
              )}
              {dossier.snapshot.headline && (
                <p className="mt-2.5 border-l-2 pl-2.5 text-[12.5px] leading-[1.45]" style={{ borderColor: "var(--accent)", color: "var(--ink-dim)" }}>
                  {dossier.snapshot.headline}
                </p>
              )}
              {dossier.snapshot.citations[0]?.url && (
                <a
                  href={dossier.snapshot.citations[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip mt-2.5 inline-flex"
                  style={{ color: "var(--accent)" }}
                >
                  {dossier.snapshot.citations[0].doc} ↗
                </a>
              )}
            </div>
          </section>
        )}

        {dossier && dossier.promises.length > 0 && <PromiseLedger promises={dossier.promises} />}

        {dossier && (dossier.bull.length > 0 || dossier.bear.length > 0) && (
          <section className="mt-5">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
              Bull vs bear
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Case title="Bull" points={dossier.bull} colour="var(--up)" />
              <Case title="Bear" points={dossier.bear} colour="var(--down)" />
            </div>
          </section>
        )}

        {dossier?.degraded && <Degraded symbol={symbol} message={dossier.degraded} />}
        {!dossier && <Degraded symbol={symbol} message={null} />}

        {filings.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
              Recent filings
            </h2>
            <div className="flex flex-col gap-2">
              {filings.map((a) => (
                <FilingCard key={a.id} a={a} now={now} compact />
              ))}
            </div>
          </section>
        )}

        {(transcripts.length > 0 || reports.length > 0) && (
          <section className="mt-5">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
              Primary sources
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {transcripts.map((d) => (
                <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="chip" style={{ color: "var(--accent)" }}>
                  Transcript {d.period} ↗
                </a>
              ))}
              {reports.map((d) => (
                <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="chip">
                  {d.label} ↗
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function Case({ title, points, colour }: { title: string; points: string[]; colour: string }) {
  return (
    <div className="card p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colour }}>
        {title}
      </h3>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {points.map((p, i) => (
          <li key={i} className="text-[12px] leading-[1.45]" style={{ color: "var(--ink-dim)" }}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Honest empty state. Never fabricate a dossier we could not ground. */
function Degraded({ symbol, message }: { symbol: string; message: string | null }) {
  return (
    <section className="card mt-4 p-4">
      <h2 className="text-[13px] font-semibold">No grounded dossier for {symbol}</h2>
      <p className="mt-1.5 text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-dim)" }}>
        {message ??
          "This symbol has no pre-built research in the corpus. The pull engine works on any NSE ticker, but it needs at least two concall transcripts to compare what management promised against what they delivered."}
      </p>
      <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
        Build it with <code>npm run dossier -- {symbol}</code>. We would rather show nothing than
        a summary we could not trace back to a filing.
      </p>
    </section>
  );
}
