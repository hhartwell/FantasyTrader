import type { LeagueResponse, TradesResponse } from "../api";
import { formatPct } from "../lib/format";
import { TradeCard } from "./TradeCard";
import { Chip, ErrorNote, Spinner } from "./ui";

interface Props {
  league: LeagueResponse;
  myRosterId: number;
  targets: string[];
  mode: 2 | 3;
  onMode: (m: 2 | 3) => void;
  tolerance: number;
  onTolerance: (t: number) => void;
  onFind: () => void;
  loading: boolean;
  error: string | null;
  result: TradesResponse | null;
}

export function TradesTab(props: Props) {
  const names = props.league.teams
    .flatMap((t) => t.players)
    .filter((p) => props.targets.includes(p.id))
    .map((p) => p.name);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800">
        <p className="text-sm">
          {names.length > 0 ? (
            <>
              <span className="text-slate-400">Targets: </span>
              {names.join(", ")}
            </>
          ) : (
            <span className="text-slate-400">Pick target players on the Targets tab first.</span>
          )}
        </p>
        <div className="flex gap-2">
          <Chip active={props.mode === 2} onClick={() => props.onMode(2)}>
            2-team
          </Chip>
          <Chip active={props.mode === 3} onClick={() => props.onMode(3)}>
            3-team
          </Chip>
        </div>
        <label className="block">
          <span className="flex justify-between text-xs text-slate-400">
            <span>Fairness tolerance</span>
            <span className="tabular-nums text-slate-200">{formatPct(props.tolerance)}</span>
          </span>
          <input
            type="range"
            min={0.03}
            max={0.2}
            step={0.01}
            value={props.tolerance}
            onChange={(e) => props.onTolerance(Number(e.target.value))}
            className="h-11 w-full accent-sky-400"
          />
        </label>
        <button
          type="button"
          disabled={names.length === 0 || props.loading}
          onClick={props.onFind}
          className="min-h-12 w-full rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          {props.loading ? "Searching…" : "Find trades"}
        </button>
      </section>

      {props.loading && <Spinner label="Searching trade combinations…" />}
      {props.error && <ErrorNote message={props.error} />}
      {props.result?.warnings.map((w) => (
        <p key={w} className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
          {w}
        </p>
      ))}
      {props.result && !props.loading && (
        <div className="space-y-3">
          {props.result.suggestions.map((s, i) => (
            <TradeCard
              key={s.id}
              index={i}
              suggestion={s}
              myRosterId={props.myRosterId}
              tolerance={props.result!.tolerance}
            />
          ))}
        </div>
      )}
    </div>
  );
}
