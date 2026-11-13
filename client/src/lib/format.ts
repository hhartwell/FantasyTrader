import type { ValuesParams } from "../api";

export function formatValue(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

export function formatPct(fraction: number, signed = false): string {
  const pct = Math.round(fraction * 1000) / 10;
  return `${signed && pct > 0 ? "+" : ""}${pct}%`;
}

export function tepLabel(tep: ValuesParams["tep"]): string {
  if (tep === "te++") return "TE++";
  if (tep === "te+") return "TE+";
  return "No TEP";
}

export function settingsLabel(p: ValuesParams): string {
  const ppr = p.ppr === 1 ? "PPR" : p.ppr === 0.5 ? "Half PPR" : "Standard";
  return `${p.isDynasty ? "Dynasty" : "Redraft"} · ${p.numQbs === 2 ? "Superflex" : "1QB"} · ${p.numTeams} teams · ${ppr} · ${tepLabel(p.tep)}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Bar fill for a team's side of a trade: share of the combined adjusted value
 * it receives. 0.5 means perfectly even.
 */
export function receiveShare(received: number, given: number): number {
  const total = received + given;
  return total > 0 ? received / total : 0.5;
}

export const POSITION_STYLES: Record<string, string> = {
  QB: "bg-rose-500/20 text-rose-300 ring-rose-500/40",
  RB: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
  WR: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
  TE: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
};

export function avatarUrl(avatar: string | null): string | null {
  return avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null;
}
