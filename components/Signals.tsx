"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Announcement, AlertConfig, Bar, Category } from "@/lib/types";
import { DEFAULT_ALERT_CONFIG } from "@/lib/types";
import { evaluateSignals, type SignalInput } from "@/lib/signals";
import { CATEGORY_LABEL } from "@/lib/categories";
import { timeAgo } from "@/lib/format";

const WATCHABLE: Category[] = [
  "results", "M&A", "management_change", "fund_raise", "litigation",
  "credit_rating", "dividend", "bonus_split", "capex", "earnings_call",
];

const KEY = "finn.alerts.v1";

/**
 * Triggered alerts. Thresholds live in localStorage and the signal list recomputes
 * synchronously as you drag - the investor should feel that they own the definition
 * of "unusual", not that they are filing a request with the app.
 */
export function Signals({
  series,
  announcements,
  now,
}: {
  series: SignalInput[];
  announcements: Announcement[];
  now: string;
}) {
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setConfig({ ...DEFAULT_ALERT_CONFIG, ...JSON.parse(raw) });
    } catch {
      /* private mode or blocked storage - defaults are fine */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }
  }, [config, loaded]);

  const signals = useMemo(
    () => evaluateSignals(series, announcements, config, 10),
    [series, announcements, config],
  );

  const counts = useMemo(
    () => ({
      price: signals.filter((s) => s.kind === "price").length,
      volume: signals.filter((s) => s.kind === "volume").length,
      category: signals.filter((s) => s.kind === "category").length,
    }),
    [signals],
  );

  const toggle = (c: Category) =>
    setConfig((p) => ({
      ...p,
      categories: p.categories.includes(c)
        ? p.categories.filter((x) => x !== c)
        : [...p.categories, c],
    }));

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))] backdrop-blur-xl"
        style={{ borderColor: "var(--line-soft)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
      >
        <h1 className="text-[22px] font-semibold leading-none tracking-tight">Signals</h1>
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
          {signals.length} fired · {counts.price} price · {counts.volume} volume · {counts.category} filing
        </p>
      </header>

      <main className="px-4 pb-6">
        {/* --- thresholds ------------------------------------------------ */}
        <section className="card mt-4 p-3.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
            You define unusual
          </h2>

          <Slider
            label="Volume spike"
            value={config.volumeMultiple}
            min={1.2}
            max={6}
            step={0.1}
            suffix="x 20-day average"
            onChange={(volumeMultiple) => setConfig((p) => ({ ...p, volumeMultiple }))}
          />
          <Slider
            label="Price move"
            value={config.priceMovePct}
            min={1}
            max={15}
            step={0.5}
            suffix="% in a day"
            prefix="±"
            onChange={(priceMovePct) => setConfig((p) => ({ ...p, priceMovePct }))}
          />

          <p className="mb-1.5 mt-4 text-[11.5px]" style={{ color: "var(--ink-dim)" }}>
            Always alert me on
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WATCHABLE.map((c) => {
              const on = config.categories.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  aria-pressed={on}
                  className="rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors"
                  style={
                    on
                      ? { background: "var(--act)", color: "#160a06" }
                      : { background: "var(--bg-sunken)", color: "var(--ink-faint)", border: "1px solid var(--line-soft)" }
                  }
                >
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </section>

        {/* --- fired ----------------------------------------------------- */}
        <h2 className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-dim)" }}>
          Fired
        </h2>

        {signals.length === 0 ? (
          <p className="card px-3.5 py-6 text-center text-[12.5px]" style={{ color: "var(--ink-faint)" }}>
            Nothing crossed your thresholds.
            <br />
            Loosen them above to see more.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {signals.slice(0, 60).map((s) => (
              <Link key={s.id} href={`/research/${s.symbol}`} className="card flex gap-3 p-3">
                <div
                  className="rail self-stretch"
                  style={{
                    background:
                      s.kind === "price"
                        ? (s.changePct ?? 0) >= 0
                          ? "var(--up)"
                          : "var(--down)"
                        : s.kind === "volume"
                          ? "var(--accent)"
                          : "var(--act)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold tracking-tight">{s.headline}</span>
                    <span className="ml-auto shrink-0 tnum text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                      {s.at.length === 10 ? s.at.slice(5) : timeAgo(s.at, now)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-[1.45]" style={{ color: "var(--ink-dim)" }}>
                    {s.detail}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Slider({
  label, value, min, max, step, suffix, prefix = "", onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  prefix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px]" style={{ color: "var(--ink-dim)" }}>
          {label}
        </span>
        <span className="tnum text-[13px] font-semibold">
          {prefix}
          {value.toFixed(1)}
          <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--ink-faint)" }}>
            {suffix}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-[var(--act)]"
        style={{ height: 24 }}
      />
    </div>
  );
}
