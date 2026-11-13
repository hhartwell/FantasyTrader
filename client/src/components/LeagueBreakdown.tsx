import type { LeagueTeam } from "../api";
import { formatPct, formatValue } from "../lib/format";
import { leagueComparison, ordinal, type PositionComparison } from "../lib/leagueBreakdown";
import { Card, PositionBadge } from "./ui";

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

export function LeagueBreakdown({ teams, rosterId }: { teams: LeagueTeam[]; rosterId: number }) {
  const comparison = leagueComparison(teams, rosterId);
  if (!comparison) return null;
  return (
    <Card className="space-y-4 md:col-span-2">
      <div>
        <h3 className="font-semibold">League comparison</h3>
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
      <div>
        <h4 className="mb-1 text-sm font-semibold text-slate-200">Every team</h4>
        <ol className="divide-y divide-slate-800">
          {comparison.standings.map((row) => {
            const mine = row.rosterId === rosterId;
            return (
              <li
                key={row.rosterId}
                className={`flex items-baseline justify-between gap-3 py-2 text-sm ${mine ? "text-sky-200" : "text-slate-300"}`}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-2 tabular-nums text-slate-500">{row.rank}</span>
                  {row.name}
                  {mine ? <span className="ml-2 text-xs text-sky-400">You</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{formatValue(row.total)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
