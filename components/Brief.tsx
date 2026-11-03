"use client";

import { useMemo, useState } from "react";
import type { Announcement } from "@/lib/types";
import { FilingCard } from "./FilingCard";

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
  { hours: 720, label: "30d" },
  { hours: 24 * 400, label: "All" },
];

/**
 * The digest. One screen that answers "what changed, and what do I do about it".
 *
 * The product opinion lives in the layout: ACT is large and open, WATCH is denser,
 * and NOISE collapses to a single honest line telling you how much was hidden.
 * Nothing is deleted - burying is a claim the investor can always audit.
 */
export function Brief({
  announcements,
  now,
  portfolioSize,
}: {
  announcements: Announcement[];
  now: string;
  portfolioSize: number;
}) {
  const [hours, setHours] = useState(168);
  const [showNoise, setShowNoise] = useState(false);

  const { act, watch, noise } = useMemo(() => {
    const cutoff = new Date(new Date(now).getTime() - hours * 3_600_000).toISOString();
    const inWindow = announcements.filter((a) => a.at >= cutoff);
    const by = (b: Announcement["bucket"]) =>
      inWindow.filter((a) => a.bucket === b).sort((x, y) => y.score - x.score || y.at.localeCompare(x.at));
    return { act: by("ACT"), watch: by("WATCH"), noise: by("NOISE") };
  }, [announcements, hours, now]);

  const total = act.length + watch.length + noise.length;
  const surfaced = act.length + watch.length;
  const buriedPct = total ? Math.round((noise.length / total) * 100) : 0;

  return (
    <>
      {/* --- header --------------------------------------------------- */}
      <header
        className="sticky top-0 z-40 border-b px-4 pb-2.5 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl"
        style={{
          borderColor: "var(--line-soft)",
          background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        }}
      >
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-semibold leading-none tracking-tight">The Brief</h1>
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
              {portfolioSize} holdings · {total} filings ·{" "}
              <span style={{ color: "var(--ink-dim)" }}>{buriedPct}% buried</span>
            </p>
          </div>
          <span className="tnum text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
            {new Date(now).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        </div>

        <div className="no-bar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              onClick={() => setHours(w.hours)}
              className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
              style={
                hours === w.hours
                  ? { background: "var(--ink)", color: "var(--bg)" }
                  : { background: "var(--bg-raised)", color: "var(--ink-dim)", border: "1px solid var(--line-soft)" }
              }
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pb-6">
        {total === 0 && (
          <p className="py-16 text-center text-[13px]" style={{ color: "var(--ink-faint)" }}>
            Nothing filed in this window.
          </p>
        )}

        <Section
          title="Act"
          blurb="Needs a decision"
          count={act.length}
          colour="var(--act)"
          show={act.length > 0}
        >
          <div className="flex flex-col gap-2.5">
            {act.map((a) => (
              <FilingCard key={a.id} a={a} now={now} />
            ))}
          </div>
        </Section>

        <Section
          title="Watch"
          blurb="Read when you can"
          count={watch.length}
          colour="var(--watch)"
          show={watch.length > 0}
        >
          <div className="flex flex-col gap-2">
            {watch.map((a) => (
              <FilingCard key={a.id} a={a} now={now} compact />
            ))}
          </div>
        </Section>

        {/* --- the buried pile ----------------------------------------- */}
        {noise.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setShowNoise((v) => !v)}
              className="card flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
              aria-expanded={showNoise}
            >
              <div className="rail self-stretch" style={{ background: "var(--noise)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium" style={{ color: "var(--ink-dim)" }}>
                  {noise.length} routine filing{noise.length === 1 ? "" : "s"} buried
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  ESOP allotments, newspaper copies, compliance certificates
                </p>
              </div>
              <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                {showNoise ? "Hide" : "Show"}
              </span>
            </button>

            {showNoise && (
              <div className="mt-2 flex flex-col gap-2">
                {noise.map((a) => (
                  <FilingCard key={a.id} a={a} now={now} compact />
                ))}
              </div>
            )}
          </div>
        )}

        {total > 0 && (
          <p className="mt-6 text-center text-[11px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            {surfaced} of {total} filings surfaced.
            <br />
            Tap any score to see why it ranked there.
          </p>
        )}
      </main>
    </>
  );
}

function Section({
  title,
  blurb,
  count,
  colour,
  show,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  colour: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: colour }}>
          {title}
        </h2>
        <span className="tnum text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {count}
        </span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {blurb}
        </span>
      </div>
      {children}
    </section>
  );
}
