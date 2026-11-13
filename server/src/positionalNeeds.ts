export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type Position = (typeof POSITIONS)[number];

export interface NeedsPlayer {
  id: string;
  position: string;
  value: number;
}

export interface NeedsTeam {
  rosterId: number;
  players: NeedsPlayer[];
}

/**
 * How a flex slot is spread across its eligible positions when computing lineup
 * requirements. Weights reflect typical usage (e.g. superflex is almost always a QB).
 */
const FLEX_WEIGHTS: Record<string, Partial<Record<Position, number>>> = {
  FLEX: { RB: 0.45, WR: 0.45, TE: 0.1 },
  WRRB_FLEX: { RB: 0.5, WR: 0.5 },
  REC_FLEX: { WR: 0.8, TE: 0.2 },
  SUPER_FLEX: { QB: 0.8, RB: 0.08, WR: 0.1, TE: 0.02 },
};

const SLOT_ELIGIBILITY: Record<string, Position[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

/** Most restrictive first so greedy filling doesn't waste flexible players. */
const FLEX_FILL_ORDER = ["REC_FLEX", "WRRB_FLEX", "FLEX", "SUPER_FLEX"];

export const EXCESS_MIN = 0.5;
export const DEFICIT_MIN = 0.5;

const isPosition = (p: string): p is Position => (POSITIONS as readonly string[]).includes(p);

const zero = (): Record<Position, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0 });

/** Starters required per position, with FLEX / SUPER_FLEX slots spread fractionally. */
export function lineupRequirements(rosterPositions: string[]): Record<Position, number> {
  const req = zero();
  for (const slot of rosterPositions) {
    if (isPosition(slot)) req[slot] += 1;
    else if (FLEX_WEIGHTS[slot]) {
      for (const [pos, w] of Object.entries(FLEX_WEIGHTS[slot])) req[pos as Position] += w!;
    }
  }
  return req;
}

/**
 * League-derived starter-caliber threshold per position: the value of the Nth-best
 * rostered player at that position, where N = teams x per-team requirement.
 */
export function starterThresholds(teams: NeedsTeam[], requirements: Record<Position, number>): Record<Position, number> {
  const out = zero();
  for (const pos of POSITIONS) {
    const n = Math.round(teams.length * requirements[pos]);
    if (n <= 0) {
      out[pos] = Infinity;
      continue;
    }
    const values = teams
      .flatMap((t) => t.players)
      .filter((p) => p.position === pos && p.value > 0)
      .map((p) => p.value)
      .sort((a, b) => b - a);
    out[pos] = Math.max(1, values[Math.min(n, values.length) - 1] ?? 1);
  }
  return out;
}

export interface NeedsContext {
  rosterPositions: string[];
  requirements: Record<Position, number>;
  thresholds: Record<Position, number>;
}

export function buildNeedsContext(teams: NeedsTeam[], rosterPositions: string[]): NeedsContext {
  const requirements = lineupRequirements(rosterPositions);
  return { rosterPositions, requirements, thresholds: starterThresholds(teams, requirements) };
}

export interface PositionNeed {
  position: Position;
  starters: number;
  required: number;
  /** Starter-caliber players minus requirement: positive = surplus, negative = deficit. */
  score: number;
}

export interface NeedsProfile {
  rosterId: number;
  byPosition: Record<Position, PositionNeed>;
  excess: { position: Position; magnitude: number }[];
  deficits: { position: Position; magnitude: number }[];
  /** Sum of all negative scores' magnitudes; lower is better. */
  deficitTotal: number;
}

export function teamProfile(rosterId: number, players: NeedsPlayer[], ctx: NeedsContext): NeedsProfile {
  const byPosition = {} as Record<Position, PositionNeed>;
  const excess: NeedsProfile["excess"] = [];
  const deficits: NeedsProfile["deficits"] = [];
  let deficitTotal = 0;
  for (const pos of POSITIONS) {
    const starters = players.filter((p) => p.position === pos && p.value >= ctx.thresholds[pos]).length;
    const required = ctx.requirements[pos];
    const score = round2(starters - required);
    byPosition[pos] = { position: pos, starters, required: round2(required), score };
    if (required > 0 && score >= EXCESS_MIN) excess.push({ position: pos, magnitude: score });
    if (score <= -DEFICIT_MIN) deficits.push({ position: pos, magnitude: -score });
    if (score < 0) deficitTotal += -score;
  }
  excess.sort((a, b) => b.magnitude - a.magnitude);
  deficits.sort((a, b) => b.magnitude - a.magnitude);
  return { rosterId, byPosition, excess, deficits, deficitTotal: round2(deficitTotal) };
}

export function leagueProfiles(teams: NeedsTeam[], ctx: NeedsContext): Map<number, NeedsProfile> {
  return new Map(teams.map((t) => [t.rosterId, teamProfile(t.rosterId, t.players, ctx)]));
}

/**
 * Number of QB/RB/WR/TE/flex starting slots the roster cannot fill with valued
 * players. Used as the positional sanity check: a trade may not increase it.
 */
export function unfilledStarterSlots(players: NeedsPlayer[], rosterPositions: string[]): number {
  const remaining = zero();
  for (const p of players) if (isPosition(p.position) && p.value > 0) remaining[p.position]++;
  let unfilled = 0;
  for (const slot of rosterPositions) {
    if (!isPosition(slot)) continue;
    if (remaining[slot] > 0) remaining[slot]--;
    else unfilled++;
  }
  for (const flex of FLEX_FILL_ORDER) {
    const count = rosterPositions.filter((s) => s === flex).length;
    for (let i = 0; i < count; i++) {
      const eligible = SLOT_ELIGIBILITY[flex].filter((pos) => remaining[pos] > 0);
      if (eligible.length === 0) {
        unfilled++;
        continue;
      }
      const pick = eligible.reduce((a, b) => (remaining[b] > remaining[a] ? b : a));
      remaining[pick]--;
    }
  }
  return unfilled;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
