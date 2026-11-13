import { useState } from "react";
import type { TeamOutcome, TradeSuggestion } from "../api";
import { formatPct, formatValue, receiveShare } from "../lib/format";
import { ValuesAttribution } from "./ValuesAttribution";
import { PositionBadge } from "./ui";

interface Props {
  index: number;
  suggestion: TradeSuggestion;
  myRosterId: number;
  tolerance: number;
  source: { name: string; url: string };
}

export function TradeCard({ index, suggestion, myRosterId, tolerance, source }: Props) {
  const teams = [...suggestion.teams].sort((a, b) => (a.rosterId === myRosterId ? -1 : b.rosterId === myRosterId ? 1 : 0));
  const names = new Map(suggestion.teams.map((t) => [t.rosterId, t.rosterId === myRosterId ? "you" : t.name]));
  const evenness = Math.max(0, 1 - suggestion.maxImbalancePct / Math.max(tolerance, 0.0001));

  return (
    <article className="space-y-2 rounded-2xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h3 className="text-sm font-semibold">
            Trade {index + 1} · {suggestion.mode}-team
          </h3>
          <p className="text-xs text-slate-400">
            {suggestion.maxImbalancePct === 0 ? "Even for everyone" : `Within ${formatPct(suggestion.maxImbalancePct)}`} ·{" "}
            {suggestion.disruption} players move
          </p>
        </div>
        <ValuesAttribution source={source} />
      </header>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" title="Fairness within tolerance">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(evenness * 100)}%` }} />
      </div>
      <div className={`grid gap-2 md:grid-cols-2 ${teams.length > 2 ? "xl:grid-cols-3" : ""}`}>
        {teams.map((t) => (
          <TeamLeg key={t.rosterId} team={t} isMe={t.rosterId === myRosterId} names={names} suggestion={suggestion} />
        ))}
      </div>
    </article>
  );
}

function TeamLeg({
  team,
  isMe,
  names,
  suggestion,
}: {
  team: TeamOutcome;
  isMe: boolean;
  names: Map<number, string>;
  suggestion: TradeSuggestion;
}) {
  const [open, setOpen] = useState(false);
  const incoming = suggestion.legs.filter((l) => l.to === team.rosterId);
  const share = receiveShare(team.receivedAdjusted, team.givenAdjusted);
  const premium =
    team.receivedAdjusted - team.receivedValue > 0
      ? { side: "receives", amount: team.receivedAdjusted - team.receivedValue }
      : team.givenAdjusted - team.givenValue > 0
        ? { side: "gives", amount: team.givenAdjusted - team.givenValue }
        : null;

  return (
    <section className={`rounded-xl bg-slate-900 p-3 ring-1 ${isMe ? "ring-sky-500/50" : "ring-slate-800"}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold">{isMe ? "You" : team.name}</h4>
        <span className={`shrink-0 text-xs tabular-nums ${team.netPct >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
          {formatPct(team.netPct, true)}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {incoming.map((leg) => (
          <div key={`${leg.from}-${leg.to}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Gets from {names.get(leg.from)}</p>
            {leg.players.map((p) => (
              <div key={p.id} className="flex min-h-8 items-center gap-2 text-sm">
                <PositionBadge position={p.position} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-slate-300">{formatValue(p.value)}</span>
              </div>
            ))}
          </div>
        ))}
        <p className="pt-1 text-xs text-slate-400">
          Gives: {team.gives.map((p) => p.name).join(", ")}
        </p>
        {team.drops.length > 0 && (
          <p className="text-xs text-amber-200/90">
            Drops to waivers: {team.drops.map((p) => `${p.name} (${formatValue(p.value)})`).join(", ")}
          </p>
        )}
      </div>

      {team.filled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {team.filled.map((pos) => (
            <span key={pos} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
              Fills {pos} need
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2" aria-label="Value received vs given">
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">in {formatValue(team.receivedAdjusted)}</span>
        <div className="relative h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-rose-400/40">
          <div className="h-full bg-emerald-400" style={{ width: `${Math.round(share * 100)}%` }} />
          <div className="absolute inset-y-0 left-1/2 w-px bg-slate-950" />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">out {formatValue(team.givenAdjusted)}</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 min-h-11 w-full text-left text-xs font-medium text-sky-300"
      >
        {open ? "Hide need-fit details" : "Show need-fit details"}
      </button>
      {open && (
        <dl className="space-y-1 border-t border-slate-800 pt-2 text-xs text-slate-300">
          <Row label="Received (raw / adjusted)" value={`${formatValue(team.receivedValue)} / ${formatValue(team.receivedAdjusted)}`} />
          <Row label="Given (raw / adjusted)" value={`${formatValue(team.givenValue)} / ${formatValue(team.givenAdjusted)}`} />
          {team.drops.length > 0 && (
            <Row
              label="Waiver drops"
              value={`${formatValue(team.drops.reduce((total, player) => total + player.value, 0))} lost`}
            />
          )}
          {premium && (
            <Row label="Consolidation premium" value={`+${formatValue(premium.amount)} on the side it ${premium.side}`} />
          )}
          <Row
            label="Positional fit"
            value={team.fitGain > 0 ? `Need reduced by ${team.fitGain}` : team.fitGain < 0 ? `Need grows by ${-team.fitGain}` : "No change"}
          />
          {team.opened.length > 0 && <Row label="Watch out" value={`Opens ${team.opened.join(", ")} hole`} />}
        </dl>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
