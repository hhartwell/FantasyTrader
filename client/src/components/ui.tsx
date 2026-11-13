import type { ReactNode } from "react";
import { POSITION_STYLES, formatValue } from "../lib/format";
import type { RosterPlayer } from "../api";

export function PositionBadge({ position }: { position: string }) {
  return (
    <span
      className={`inline-flex w-9 shrink-0 justify-center rounded-md py-0.5 text-xs font-bold ring-1 ${
        POSITION_STYLES[position] ?? "bg-slate-700 text-slate-300 ring-slate-600"
      }`}
    >
      {position}
    </span>
  );
}

export function PlayerRow({ player, right, sub }: { player: RosterPlayer; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <PositionBadge position={player.position} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{player.name}</div>
        <div className="truncate text-xs text-slate-400">
          {sub ?? [player.team ?? "FA", player.age ? `${Math.round(player.age)}y` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      {right ?? <span className="text-sm tabular-nums text-slate-200">{formatValue(player.value)}</span>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-slate-900 p-4 ring-1 ring-slate-800 ${className}`}>{children}</section>;
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ring-1 transition ${
        active ? "bg-sky-500 text-slate-950 ring-sky-400" : "bg-slate-900 text-slate-300 ring-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-400" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300 ring-1 ring-rose-500/30">{message}</p>;
}
