import type { ValueSource } from "../api";
import { fantasyCalcEnabled } from "../config";

const OPTIONS: { id: ValueSource; label: string }[] = [
  { id: "fantasycalc", label: "FantasyCalc" },
  { id: "sleeper", label: "Sleeper" },
  { id: "yahoo", label: "Yahoo" },
].filter((option): option is { id: ValueSource; label: string } => option.id !== "fantasycalc" || fantasyCalcEnabled);

const HINT: Record<ValueSource, string> = {
  fantasycalc: "FantasyCalc trade values for this league's format.",
  sleeper: "Sleeper ADP for dynasty, superflex, and PPR. Tight end premium is not included.",
  yahoo: "Yahoo's overall rank. One list for every format.",
};

export function ValueSourceSelect({
  value,
  onChange,
}: {
  value: ValueSource;
  onChange: (source: ValueSource) => void;
}) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex gap-2" role="group" aria-label="Value source">
        {OPTIONS.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`min-h-11 flex-1 rounded-full px-2 text-sm font-medium ring-1 transition ${
                active ? "bg-sky-500 text-slate-950 ring-sky-400" : "bg-slate-900 text-slate-300 ring-slate-700"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">{HINT[value]}</p>
    </div>
  );
}
