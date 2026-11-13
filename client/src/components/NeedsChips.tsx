import type { NeedsProfile } from "../api";

export function NeedsChips({ profile, compact = false }: { profile?: NeedsProfile; compact?: boolean }) {
  if (!profile) return null;
  if (profile.excess.length === 0 && profile.deficits.length === 0) {
    if (compact) return null;
    return <p className="text-xs text-slate-400">Balanced roster: no clear surplus or need.</p>;
  }
  const chip = compact
    ? "rounded-full px-2 py-0.5 text-[11px] ring-1"
    : "rounded-full px-2.5 py-1 text-xs ring-1";
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
      {profile.deficits.map((d) => (
        <span
          key={`d-${d.position}`}
          aria-label={`Needs ${d.position} ${d.magnitude.toFixed(1)}`}
          className={`${chip} bg-rose-500/15 text-rose-300 ring-rose-500/30`}
        >
          {compact ? `${d.position} -${d.magnitude.toFixed(1)}` : `Needs ${d.position} (${d.magnitude.toFixed(1)})`}
        </span>
      ))}
      {profile.excess.map((e) => (
        <span
          key={`e-${e.position}`}
          aria-label={`Surplus ${e.position} ${e.magnitude.toFixed(1)}`}
          className={`${chip} bg-emerald-500/15 text-emerald-300 ring-emerald-500/30`}
        >
          {compact ? `${e.position} +${e.magnitude.toFixed(1)}` : `Surplus ${e.position} (+${e.magnitude.toFixed(1)})`}
        </span>
      ))}
    </div>
  );
}
