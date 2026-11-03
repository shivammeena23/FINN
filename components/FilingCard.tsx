"use client";

import { useState } from "react";
import Link from "next/link";
import type { Announcement } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/categories";
import { BUCKET_COLOR, cleanFilingText, crore, deltaPct, pct, timeAgo } from "@/lib/format";

/**
 * One filing.
 *
 * Deliberately *not* a uniform card: a results filing renders its headline numbers,
 * a management change renders who is arriving, everything else renders a single line.
 * The brief's point is that deciding what earns attention per type is the judgement.
 */
export function FilingCard({
  a,
  now,
  compact = false,
}: {
  a: Announcement;
  now: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const colour = BUCKET_COLOR[a.bucket];
  const headline = cleanFilingText(a.text, a.company);

  return (
    <article className="card rise overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="rail self-stretch" style={{ background: colour }} />

        <div className="min-w-0 flex-1">
          {/* --- identity row --- */}
          <div className="flex items-baseline gap-2">
            <Link
              href={`/research/${a.symbol}`}
              className="truncate text-[13.5px] font-semibold tracking-tight hover:underline"
            >
              {a.symbol}
            </Link>
            <span className="truncate text-[11px]" style={{ color: "var(--ink-faint)" }}>
              {a.company.replace(/\s+Limited$/i, "")}
            </span>
            <span className="ml-auto shrink-0 text-[10.5px] tnum" style={{ color: "var(--ink-faint)" }}>
              {timeAgo(a.at, now)}
            </span>
          </div>

          {/* --- the filing --- */}
          <p
            className={`mt-1.5 text-[13px] leading-[1.45] ${compact && !open ? "line-clamp-2" : ""}`}
            style={{ color: "var(--ink)" }}
          >
            {headline}
          </p>

          {/* --- our judgement, not a summary --- */}
          {a.why && (
            <p
              className="mt-2 border-l-2 pl-2.5 text-[12.5px] leading-[1.45]"
              style={{ borderColor: colour, color: "var(--ink-dim)" }}
            >
              {a.why}
            </p>
          )}

          {a.metrics && <MetricsTable m={a.metrics} />}
          {a.bio && <BioBlock bio={a.bio} />}

          {/* --- footer --- */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="chip" style={{ borderColor: colour, color: colour }}>
              {CATEGORY_LABEL[a.category]}
            </span>
            {a.pdf && (
              <a
                href={a.pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="chip hover:opacity-80"
                style={{ color: "var(--accent)", borderColor: "var(--line)" }}
              >
                Filing ↗
              </a>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="chip ml-auto hover:opacity-80"
              aria-expanded={open}
              title="Why this was ranked here"
            >
              {a.score} {open ? "▴" : "▾"}
            </button>
          </div>

          {/* Triage must be auditable: show exactly which rules fired. */}
          {open && (
            <p
              className="mt-2 rounded-md px-2 py-1.5 text-[11px] leading-[1.5]"
              style={{ background: "var(--bg-sunken)", color: "var(--ink-faint)" }}
            >
              <span style={{ color: "var(--ink-dim)" }}>NSE category</span> {a.nseDesc || "—"}
              <br />
              <span style={{ color: "var(--ink-dim)" }}>Scored</span> {a.reason}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/** Revenue / EBITDA / PBT / PAT with QoQ and YoY, exactly as the brief specifies. */
function MetricsTable({ m }: { m: NonNullable<Announcement["metrics"]> }) {
  const rows = [
    { k: "Revenue", cur: m.current.revenue, q: m.previousQuarter?.revenue ?? null, y: m.yearAgoQuarter?.revenue ?? null },
    { k: "EBITDA", cur: m.current.ebitda, q: m.previousQuarter?.ebitda ?? null, y: m.yearAgoQuarter?.ebitda ?? null },
    { k: "PBT", cur: m.current.pbt, q: m.previousQuarter?.pbt ?? null, y: m.yearAgoQuarter?.pbt ?? null },
    { k: "PAT", cur: m.current.pat, q: m.previousQuarter?.pat ?? null, y: m.yearAgoQuarter?.pat ?? null },
  ].filter((r) => r.cur != null);

  if (!rows.length) return null;

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg" style={{ background: "var(--bg-sunken)" }}>
      <div
        className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--ink-faint)" }}
      >
        <span>{m.current.label}</span>
        <span className="text-right">₹ cr</span>
        <span className="w-11 text-right">QoQ</span>
        <span className="w-11 text-right">YoY</span>
      </div>
      {rows.map((r) => {
        const dq = deltaPct(r.cur, r.q);
        const dy = deltaPct(r.cur, r.y);
        return (
          <div
            key={r.k}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-t px-2.5 py-1.5 text-[12px]"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <span style={{ color: "var(--ink-dim)" }}>{r.k}</span>
            <span className="tnum text-right font-medium">{crore(r.cur)}</span>
            <Delta v={dq} />
            <Delta v={dy} />
          </div>
        );
      })}
    </div>
  );
}

function Delta({ v }: { v: number | null }) {
  return (
    <span
      className="tnum w-11 text-right text-[11.5px]"
      style={{ color: v == null ? "var(--ink-faint)" : v >= 0 ? "var(--up)" : "var(--down)" }}
    >
      {v == null ? "—" : pct(v, 0)}
    </span>
  );
}

/** Management change: who is arriving, and where from. */
function BioBlock({ bio }: { bio: NonNullable<Announcement["bio"]> }) {
  return (
    <div
      className="mt-2.5 flex gap-2.5 rounded-lg p-2.5"
      style={{ background: "var(--bg-sunken)" }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={{ background: "var(--line)", color: "var(--ink-dim)" }}
      >
        {bio.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold leading-tight">{bio.name}</p>
        <p className="text-[11px] leading-tight" style={{ color: "var(--ink-faint)" }}>
          {bio.role} · {bio.movement}
        </p>
        {bio.background && (
          <p className="mt-1 text-[12px] leading-[1.45]" style={{ color: "var(--ink-dim)" }}>
            {bio.background}
          </p>
        )}
      </div>
    </div>
  );
}
