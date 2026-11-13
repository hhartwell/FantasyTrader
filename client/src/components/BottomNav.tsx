import type { ReactNode } from "react";

export type Tab = "league" | "targets" | "trades";

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    {d}
  </svg>
);

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "league",
    label: "League",
    icon: icon(<path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" />),
  },
  {
    id: "targets",
    label: "Targets",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </>,
    ),
  },
  {
    id: "trades",
    label: "Trades",
    icon: icon(<path strokeLinecap="round" strokeLinejoin="round" d="M7 7h12l-3-3M17 17H5l3 3" />),
  },
];

export function BottomNav({
  tab,
  onTab,
  enabled,
  badges,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  enabled: Record<Tab, boolean>;
  badges: Partial<Record<Tab, number>>;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-5xl">
        {TABS.map((t) => (
          <li key={t.id} className="flex-1">
            <button
              type="button"
              disabled={!enabled[t.id]}
              onClick={() => onTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium disabled:opacity-30 ${
                tab === t.id ? "text-sky-300" : "text-slate-400"
              }`}
            >
              {t.icon}
              {t.label}
              {badges[t.id] ? (
                <span className="absolute top-1.5 right-[calc(50%-24px)] min-w-5 rounded-full bg-sky-500 px-1 text-[10px] font-bold text-slate-950">
                  {badges[t.id]}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
