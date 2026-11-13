import { useState } from "react";
import type { LeagueTeam, RosterPlayer } from "../api";
import { formatPct, formatValue } from "../lib/format";
import { leagueComparison, ordinal, type PositionComparison } from "../lib/leagueBreakdown";
import { Card, PlayerRow, PositionBadge } from "./ui";

function versusLabel(delta: number | null): string {
  if (delta == null) return "The rest of the league has no value here yet";
  if (Math.abs(delta) < 0.005) return "Even with the rest of the league";
  const amount = formatPct(Math.abs(delta));
  return delta > 0 ? `${amount} above the rest of the league` : `${amount} below the rest of the league`;
}

function versusShort(delta: number | null): string {
  if (delta == null) return "No comparison";
  if (Math.abs(delta) < 0.005) return "Even";
  const amount = formatPct(Math.abs(delta));
  return delta > 0 ? `${amount} above` : `${amount} below`;
}

function PositionRow({ row }: { row: PositionComparison }) {
  const best = row.shareOfBest > 0 ? row.value / row.shareOfBest : row.restAverage;
  const mark = best > 0 ? Math.min(100, (row.restAverage / best) * 100) : 0;
  return (
    <li className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3">
      <PositionBadge position={row.position} />
      <div className="relative h-2 rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-sky-400" style={{ width: `${Math.min(100, row.shareOfBest * 100)}%` }} />
        {mark > 0 && (
          <span
            className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-slate-200"
            style={{ left: `${mark}%` }}
            title="Average of the other teams"
          />
        )}
      </div>
      <div className="text-right">
        <div className="text-sm tabular-nums text-slate-100">{formatValue(row.value)}</div>
        <div className="text-xs text-slate-400">
          {ordinal(row.rank)} · {versusShort(row.versusRest)}
        </div>
      </div>
    </li>
  );
}

const ROSTER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF", "DST"];

function rosterPlayers(team: LeagueTeam): RosterPlayer[] {
  return team.players
    .filter((player) => ROSTER_POSITIONS.includes(player.position))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function LeagueBreakdown({ teams, rosterId }: { teams: LeagueTeam[]; rosterId: number }) {
  const comparison = leagueComparison(teams, rosterId);
  const [open, setOpen] = useState<Set<number>>(() => new Set([rosterId]));
  if (!comparison) return null;
  const byId = new Map(teams.map((team) => [team.rosterId, team]));
  const toggle = (id: number) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">League comparison</h2>
          <p className="mt-1 text-sm text-slate-300">
            {ordinal(comparison.rank)} of {comparison.teamCount} in roster value · {versusLabel(comparison.versusRest)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Bars are your value. The mark is the average of the other teams.</p>
        </div>
        <ul className="space-y-3">
          {comparison.positions.map((row) => (
            <PositionRow key={row.position} row={row} />
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-slate-200">Every team</h3>
        <p className="mb-2 text-xs text-slate-500">Tap a team to see its players.</p>
        <ul className="divide-y divide-slate-800">
          {comparison.standings.map((row) => {
            const mine = row.rosterId === rosterId;
            const expanded = open.has(row.rosterId);
            const players = rosterPlayers(byId.get(row.rosterId)!);
            return (
              <li key={row.rosterId}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(row.rosterId)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm ${
                    mine ? "text-sky-200" : "text-slate-300"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-2 tabular-nums text-slate-500">{row.rank}</span>
                    {row.name}
                    {mine ? <span className="ml-2 text-xs text-sky-400">You</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{formatValue(row.total)}</span>
                    <svg
                      viewBox="0 0 20 20"
                      aria-hidden
                      className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                    </svg>
                  </span>
                </button>
                {expanded && (
                  <div className="divide-y divide-slate-800 pb-2 pl-1">
                    {players.map((player) => (
                      <PlayerRow key={player.id} player={player} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
