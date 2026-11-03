"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";

/**
 * Entry point for pull-side research.
 *
 * The free-text box is the important part: the engine is not wired to our demo list,
 * so any NSE symbol is a valid destination. The curated rows below are shortcuts, not
 * the boundary of what works.
 */
export function ResearchIndex({
  portfolio,
  adhoc,
  ready,
}: {
  portfolio: Company[];
  adhoc: Company[];
  ready: string[];
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const readySet = useMemo(() => new Set(ready), [ready]);

  const match = (c: Company) =>
    !q.trim() ||
    c.symbol.toLowerCase().includes(q.toLowerCase().trim()) ||
    c.name.toLowerCase().includes(q.toLowerCase().trim());

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = q.trim().toUpperCase();
    if (s) router.push(`/research/${encodeURIComponent(s)}`);
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl"
        style={{ borderColor: "var(--line-soft)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
      >
        <h1 className="text-[22px] font-semibold leading-none tracking-tight">Research</h1>
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
          Grounded in annual reports and concall transcripts only
        </p>

        <form onSubmit={go} className="mt-2.5 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Any NSE symbol, e.g. TITAN"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg px-3 text-[14px] outline-none"
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              height: "var(--tap)",
            }}
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg px-4 text-[13px] font-semibold"
            style={{ background: "var(--ink)", color: "var(--bg)", height: "var(--tap)" }}
          >
            Dig in
          </button>
        </form>
      </header>

      <main className="px-4 pb-6">
        <Group title="Portfolio" items={portfolio.filter(match)} readySet={readySet} />
        <Group title="Not held · proves it generalises" items={adhoc.filter(match)} readySet={readySet} />

        <p className="mt-5 text-center text-[11px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          A dot marks a pre-built dossier.
          <br />
          Any other symbol is fetched from primary sources on demand.
        </p>
      </main>
    </>
  );
}

function Group({ title, items, readySet }: { title: string; items: Company[]; readySet: Set<string> }) {
  if (!items.length) return null;
  return (
    <section className="mt-4">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
        {title}
      </h2>
      <div className="flex flex-col gap-1.5">
        {items.map((c) => (
          <Link key={c.symbol} href={`/research/${c.symbol}`} className="card flex items-center gap-3 px-3 py-2.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: readySet.has(c.symbol) ? "var(--up)" : "var(--line)" }}
              aria-hidden
            />
            <span className="w-[86px] shrink-0 text-[13px] font-semibold tracking-tight">{c.symbol}</span>
            <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--ink-dim)" }}>
              {c.name}
            </span>
            <span className="shrink-0 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              {c.sector}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
