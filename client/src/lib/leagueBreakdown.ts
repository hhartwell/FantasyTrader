import type { LeagueTeam, Position } from "../api";

export const SKILL_POSITIONS = ["QB", "RB", "WR", "TE"] as const satisfies readonly Position[];

export interface StandingRow {
  rosterId: number;
  name: string;
  ownerName: string;
  total: number;
  rank: number;
}

export interface PositionComparison {
  position: Position;
  value: number;
  rank: number;
  restAverage: number;
  /** (value − average of the other teams) / that average. Null when the others total zero. */
  versusRest: number | null;
  /** This team's value divided by the best team at the position. */
  shareOfBest: number;
}

export interface LeagueComparison {
  total: number;
  rank: number;
  teamCount: number;
  restAverage: number;
  versusRest: number | null;
  positions: PositionComparison[];
  standings: StandingRow[];
}

export function positionValue(team: LeagueTeam, position: Position): number {
  return team.players.filter((player) => player.position === position).reduce((sum, player) => sum + player.value, 0);
}

/** 1st, 2nd, 3rd, 4th. Tied values share the better rank. */
export function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

function rankOf(value: number, values: number[]): number {
  return 1 + values.filter((other) => other > value).length;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function versusRest(value: number, others: number[]): number | null {
  const rest = average(others);
  if (rest <= 0) return null;
  return (value - rest) / rest;
}

export function leagueComparison(teams: LeagueTeam[], rosterId: number): LeagueComparison | null {
  const mine = teams.find((team) => team.rosterId === rosterId);
  if (!mine || teams.length === 0) return null;
  const others = teams.filter((team) => team.rosterId !== rosterId);
  const totals = teams.map((team) => team.totalValue);
  const positions = SKILL_POSITIONS.map((position) => {
    const values = teams.map((team) => positionValue(team, position));
    const value = positionValue(mine, position);
    const best = Math.max(...values, 0);
    return {
      position,
      value,
      rank: rankOf(value, values),
      restAverage: average(others.map((team) => positionValue(team, position))),
      versusRest: versusRest(value, others.map((team) => positionValue(team, position))),
      shareOfBest: best > 0 ? value / best : 0,
    };
  });
  const standings = [...teams]
    .map((team) => ({
      rosterId: team.rosterId,
      name: team.teamName,
      ownerName: team.ownerName,
      total: team.totalValue,
      rank: rankOf(team.totalValue, totals),
    }))
    .sort((a, b) => a.rank - b.rank || b.total - a.total || a.name.localeCompare(b.name));
  return {
    total: mine.totalValue,
    rank: rankOf(mine.totalValue, totals),
    teamCount: teams.length,
    restAverage: average(others.map((team) => team.totalValue)),
    versusRest: versusRest(mine.totalValue, others.map((team) => team.totalValue)),
    positions,
    standings,
  };
}
