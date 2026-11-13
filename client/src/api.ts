export type Tep = "none" | "te+" | "te++";

export type ValueSource = "fantasycalc" | "sleeper" | "yahoo";

export interface ValuesParams {
  isDynasty: boolean;
  numQbs: 1 | 2;
  numTeams: number;
  ppr: 0 | 0.5 | 1;
  tep: Tep;
}

export interface ValuesMeta {
  requested: ValuesParams;
  used: ValuesParams;
  exact: boolean;
  fetchedAt: string;
  source: { name: string; url: string };
  /** Present when values were converted from a Sleeper or Yahoo rank. */
  basis?: string;
}

export interface LeagueSummary {
  id: string;
  name: string;
  season: string;
  status: string;
  avatar: string | null;
  totalRosters: number;
  detected: ValuesParams;
}

export interface LeaguesResponse {
  user: { userId: string; username: string; displayName: string; avatar: string | null };
  season: string;
  leagues: LeagueSummary[];
}

export interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number;
}

export interface LeagueTeam {
  rosterId: number;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  avatar: string | null;
  totalValue: number;
  players: RosterPlayer[];
}

export interface LeagueResponse {
  league: { id: string; name: string; season: string; rosterPositions: string[]; detected: ValuesParams };
  values: ValuesMeta;
  teams: LeagueTeam[];
  profiles: NeedsProfile[];
}

export type Position = "QB" | "RB" | "WR" | "TE";

export interface TradeLeg {
  from: number;
  to: number;
  players: RosterPlayer[];
}

export interface TeamOutcome {
  rosterId: number;
  name: string;
  gives: RosterPlayer[];
  receives: RosterPlayer[];
  givenValue: number;
  receivedValue: number;
  givenAdjusted: number;
  receivedAdjusted: number;
  netPct: number;
  fitGain: number;
  filled: Position[];
  opened: Position[];
}

export interface TradeSuggestion {
  id: string;
  mode: 2 | 3;
  legs: TradeLeg[];
  teams: TeamOutcome[];
  maxImbalancePct: number;
  fitScore: number;
  disruption: number;
  score: number;
}

export interface NeedsProfile {
  rosterId: number;
  byPosition: Record<Position, { position: Position; starters: number; required: number; score: number }>;
  excess: { position: Position; magnitude: number }[];
  deficits: { position: Position; magnitude: number }[];
  deficitTotal: number;
}

export interface TradesResponse {
  values: ValuesMeta;
  mode: 2 | 3;
  tolerance: number;
  suggestions: TradeSuggestion[];
  profiles: NeedsProfile[];
  warnings: string[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function fetchLeagues(username: string) {
  return request<LeaguesResponse>(`/api/leagues?username=${encodeURIComponent(username)}`);
}

export function fetchLeague(id: string, overrides?: ValuesParams, source: ValueSource = "fantasycalc") {
  const q = new URLSearchParams();
  if (source !== "fantasycalc") q.set("source", source);
  if (overrides) {
    q.set("isDynasty", String(overrides.isDynasty));
    q.set("numQbs", String(overrides.numQbs));
    q.set("numTeams", String(overrides.numTeams));
    q.set("ppr", String(overrides.ppr));
    q.set("tep", overrides.tep);
  }
  const search = q.toString();
  return request<LeagueResponse>(`/api/league/${id}${search ? `?${search}` : ""}`);
}

export function fetchTrades(body: {
  leagueId: string;
  myRosterId: number;
  targetPlayerIds: string[];
  excludedPlayerIds?: string[];
  mode: 2 | 3;
  tolerance: number;
  values?: ValuesParams;
  source?: ValueSource;
}) {
  return request<TradesResponse>("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
