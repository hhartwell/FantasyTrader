import type { NeedsProfile } from "../api";

export function NeedsChips({ profile }: { profile?: NeedsProfile }) {
  if (!profile) return null;
  if (profile.excess.length === 0 && profile.deficits.length === 0) {
    return <p className="text-xs text-slate-400">Balanced roster: no clear surplus or need.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {profile.deficits.map((d) => (
        <span key={`d-${d.position}`} className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30">
          Needs {d.position} ({d.magnitude.toFixed(1)})
        </span>
      ))}
      {profile.excess.map((e) => (
        <span key={`e-${e.position}`} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
          Surplus {e.position} (+{e.magnitude.toFixed(1)})
        </span>
      ))}
    </div>
  );
}
