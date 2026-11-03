"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Brief", icon: BriefIcon },
  { href: "/signals", label: "Signals", icon: SignalIcon },
  { href: "/research", label: "Research", icon: ResearchIcon },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-xl"
      style={{
        borderColor: "var(--line-soft)",
        background: "color-mix(in srgb, var(--bg) 86%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[460px]">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-[3px] py-2.5 transition-colors"
              style={{ color: active ? "var(--ink)" : "var(--ink-faint)", minHeight: "var(--tap)" }}
            >
              <Icon active={active} />
              <span className="text-[10.5px] font-medium tracking-wide">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function BriefIcon({ active }: { active: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="4.2" rx="1.4" fill={active ? "var(--act)" : "currentColor"} />
      <rect x="3" y="10.4" width="13" height="3.4" rx="1.2" fill="currentColor" opacity={active ? 0.75 : 1} />
      <rect x="3" y="16" width="8" height="3.4" rx="1.2" fill="currentColor" opacity={active ? 0.4 : 0.7} />
    </svg>
  );
}

function SignalIcon({ active }: { active: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 15.5 8 9l4 4.2L21 4"
        stroke={active ? "var(--act)" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="4" r="2.4" fill={active ? "var(--act)" : "currentColor"} />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function ResearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.6" stroke={active ? "var(--act)" : "currentColor"} strokeWidth="2" />
      <path d="m16.2 16.2 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.6 11.6h4.8M8.6 8.8h4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}
