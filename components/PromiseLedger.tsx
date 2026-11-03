"use client";

import { useState } from "react";
import type { Promise_ } from "@/lib/types";

const VERDICT = {
  kept: { label: "Kept", colour: "var(--up)", mark: "✓" },
  partial: { label: "Partial", colour: "var(--watch)", mark: "~" },
  missed: { label: "Missed", colour: "var(--down)", mark: "✕" },
  too_early: { label: "Open", colour: "var(--ink-faint)", mark: "·" },
} as const;

/**
 * The ledger: what management said, against what the filings show.
 *
 * This is the difference between summarising management and analysing them. Every row
 * is two verbatim quotes - the promise and the evidence - so the investor is never
 * asked to trust a generated sentence. Tap a row to see both.
 */
export function PromiseLedger({ promises }: { promises: Promise_[] }) {
  const counts = promises.reduce<Record<string, number>>((a, p) => {
    a[p.verdict] = (a[p.verdict] ?? 0) + 1;
    return a;
  }, {});

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
          Promised vs delivered
        </h2>
        <span className="ml-auto text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {promises.length} commitments
        </span>
      </div>

      {/* Scorecard: the one-glance answer to "can I trust their guidance". */}
      <div className="card mb-2.5 flex divide-x" style={{ borderColor: "var(--line-soft)" }}>
        {(["kept", "partial", "missed", "too_early"] as const).map((v) => (
          <div key={v} className="flex-1 px-2 py-2.5 text-center" style={{ borderColor: "var(--line-soft)" }}>
            <div className="tnum text-[18px] font-semibold leading-none" style={{ color: VERDICT[v].colour }}>
              {counts[v] ?? 0}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
              {VERDICT[v].label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {promises.map((p, i) => (
          <Row key={i} p={p} />
        ))}
      </div>
    </section>
  );
}

function Row({ p }: { p: Promise_ }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT[p.verdict];

  return (
    <article className="card overflow-hidden">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full gap-3 p-3 text-left" aria-expanded={open}>
        <div className="rail self-stretch" style={{ background: v.colour }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: v.colour }}
            >
              {v.mark} {v.label}
            </span>
            <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              said {p.madeOn}
            </span>
          </div>

          <p className="mt-1 text-[13px] font-medium leading-[1.4]">{p.promise}</p>

          <p className="mt-1.5 text-[12.5px] leading-[1.45]" style={{ color: "var(--ink-dim)" }}>
            {p.actual}
          </p>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="chip">{p.horizon}</span>
            <span className="ml-auto text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              {open ? "Hide sources ▴" : "Sources ▾"}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--line-soft)" }}>
          <Quote label={`Said on the ${p.madeOn} call`} text={p.quote} url={p.source.url} />
          {p.evidence.map((e, i) => (
            <Quote key={i} label={`Evidence · ${e.doc}`} text={e.quote ?? ""} url={e.url} />
          ))}
        </div>
      )}
    </article>
  );
}

function Quote({ label, text, url }: { label: string; text: string; url: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
        {label}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 font-normal normal-case"
            style={{ color: "var(--accent)" }}
          >
            open ↗
          </a>
        )}
      </p>
      <blockquote
        className="mt-1 border-l-2 pl-2.5 text-[12px] italic leading-[1.5]"
        style={{ borderColor: "var(--line)", color: "var(--ink-dim)" }}
      >
        &ldquo;{text}&rdquo;
      </blockquote>
    </div>
  );
}
