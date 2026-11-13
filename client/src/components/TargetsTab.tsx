import { useMemo, useState } from "react";
import type { LeagueResponse, RosterPlayer } from "../api";
import { formatValue } from "../lib/format";
import { FantasyCalcAttribution } from "./FantasyCalcAttribution";
import { Chip, PlayerRow } from "./ui";

const FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;

interface Props {
  league: LeagueResponse;
  myRosterId: number;
  targets: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onFind: () => void;
}

export function TargetsTab({ league, myRosterId, targets, onToggle, onClear, onFind }: Props) {
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<(typeof FILTERS)[number]>("ALL");

  const pool = useMemo(
    () =>
      league.teams
        .filter((t) => t.rosterId !== myRosterId)
        .flatMap((t) => t.players.map((p) => ({ ...p, teamName: t.teamName })))
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value),
    [league, myRosterId],
  );

  const q = query.trim().toLowerCase();
  const visible = pool.filter(
    (p) => (pos === "ALL" || p.position === pos) && (!q || p.name.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q)),
  );
  const selected = targets
    .map((id) => pool.find((p) => p.id === id))
    .filter((p): p is RosterPlayer & { teamName: string } => Boolean(p));

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-slate-950/95 px-4 pt-1 pb-2 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players or teams"
          className="min-h-11 w-full rounded-xl bg-slate-800 px-3 text-base ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500"
        />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <Chip key={f} active={pos === f} onClick={() => setPos(f)}>
              {f === "ALL" ? "All" : f}
            </Chip>
          ))}
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-900 p-2 ring-1 ring-sky-500/40">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{selected.length} target{selected.length > 1 ? "s" : ""}: </span>
              <span className="text-slate-300">{selected.map((p) => p.name).join(", ")}</span>
            </div>
            <button type="button" onClick={onClear} className="min-h-11 px-2 text-xs text-slate-400">
              Clear
            </button>
            <button
              type="button"
              onClick={onFind}
              className="min-h-11 shrink-0 rounded-xl bg-sky-500 px-3 text-sm font-semibold text-slate-950"
            >
              Find trades
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-400">{visible.length} players on other rosters</span>
        <FantasyCalcAttribution />
      </div>

      <ul className="grid gap-x-4 md:grid-cols-2">
        {visible.slice(0, 150).map((p) => {
          const on = targets.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(p.id)}
                className={`w-full rounded-xl px-3 text-left ring-1 transition ${
                  on ? "bg-sky-500/10 ring-sky-500/60" : "ring-transparent hover:bg-slate-900"
                }`}
              >
                <PlayerRow
                  player={p}
                  sub={`${p.team ?? "FA"} · ${p.teamName}`}
                  right={
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">{formatValue(p.value)}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ring-1 ${
                          on ? "bg-sky-500 text-slate-950 ring-sky-400" : "ring-slate-600"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : "+"}
                      </span>
                    </span>
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
