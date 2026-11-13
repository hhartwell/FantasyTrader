import {
  buildNeedsContext,
  leagueProfiles,
  POSITIONS,
  teamProfile,
  unfilledStarterSlots,
  type NeedsContext,
  type NeedsProfile,
  type Position,
} from "./positionalNeeds.js";

export interface EnginePlayer {
  id: string;
  name: string;
  position: string;
  value: number;
}

export interface EngineTeam {
  rosterId: number;
  name: string;
  players: EnginePlayer[];
}

export interface TradeLeg {
  from: number;
  to: number;
  players: EnginePlayer[];
}

export interface TeamOutcome {
  rosterId: number;
  name: string;
  gives: EnginePlayer[];
  receives: EnginePlayer[];
  givenValue: number;
  receivedValue: number;
  givenAdjusted: number;
  receivedAdjusted: number;
  /** (received - given) / given, adjusted values. Negative = this team gives up value. */
  netPct: number;
  /** Reduction in total positional deficit (positive = needs improved). */
  fitGain: number;
  filled: Position[];
  opened: Position[];
}

export interface TradeSuggestion {
  id: string;
  mode: 2 | 3;
  legs: TradeLeg[];
  teams: TeamOutcome[];
  /** Largest share of value any team gives up beyond what it receives (0 = perfectly even). */
  maxImbalancePct: number;
  fitScore: number;
  disruption: number;
  score: number;
}

export interface TradeRequest {
  teams: EngineTeam[];
  rosterPositions: string[];
  myRosterId: number;
  targetPlayerIds: string[];
  mode: 2 | 3;
  /** Allowed value shortfall per team, e.g. 0.1 = 10%. */
  tolerance: number;
  limit?: number;
}

export interface TradeResponse {
  suggestions: TradeSuggestion[];
  profiles: NeedsProfile[];
  warnings: string[];
}

// ---------- Package valuation ----------

export const CONSOLIDATION_RATE = 0.1;
const MAX_EXTRA_PLAYERS = 3;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Compares two packages and applies a consolidation premium to the side with fewer
 * players: one star outweighs several depth pieces. The premium grows with the top
 * asset's share of its package and the player-count gap, and shrinks when the larger
 * side's best player is close to the smaller side's best.
 */
export function compareSides(a: number[], b: number[]): { a: number; b: number } {
  const rawA = sum(a);
  const rawB = sum(b);
  if (a.length === b.length || a.length === 0 || b.length === 0) return { a: rawA, b: rawB };
  const [few, many] = a.length < b.length ? [a, b] : [b, a];
  const topFew = Math.max(...few);
  const topMany = Math.max(...many);
  const rawFew = sum(few);
  if (topFew <= 0 || rawFew <= 0) return { a: rawA, b: rawB };
  const topShare = topFew / rawFew;
  const extra = Math.min(many.length - few.length, MAX_EXTRA_PLAYERS);
  const starGap = 1 - 0.5 * Math.min(1, topMany / topFew);
  const premium = CONSOLIDATION_RATE * extra * topFew * topShare * starGap;
  return few === a ? { a: rawA + premium, b: rawB } : { a: rawA, b: rawB + premium };
}

// ---------- Trade evaluation ----------

interface SearchContext {
  teams: Map<number, EngineTeam>;
  needs: NeedsContext;
  profiles: Map<number, NeedsProfile>;
  unfilledBefore: Map<number, number>;
  tolerance: number;
  rosterPositions: string[];
}

function rosterAfter(team: EngineTeam, legs: TradeLeg[]): EnginePlayer[] {
  const out = new Set(legs.filter((l) => l.from === team.rosterId).flatMap((l) => l.players.map((p) => p.id)));
  const incoming = legs.filter((l) => l.to === team.rosterId).flatMap((l) => l.players);
  return [...team.players.filter((p) => !out.has(p.id)), ...incoming];
}

/** Returns null if the trade breaks tolerance or positional sanity for any team. */
export function evaluateTrade(legs: TradeLeg[], ctx: SearchContext, mode: 2 | 3): TradeSuggestion | null {
  const involved = [...new Set(legs.flatMap((l) => [l.from, l.to]))];
  const outcomes: TeamOutcome[] = [];
  let maxImbalance = 0;
  let fitScore = 0;

  for (const rosterId of involved) {
    const team = ctx.teams.get(rosterId)!;
    const gives = legs.filter((l) => l.from === rosterId).flatMap((l) => l.players);
    const receives = legs.filter((l) => l.to === rosterId).flatMap((l) => l.players);
    const cmp = compareSides(
      receives.map((p) => p.value),
      gives.map((p) => p.value),
    );
    const receivedAdjusted = cmp.a;
    const givenAdjusted = cmp.b;
    if (givenAdjusted > 0 && receivedAdjusted < givenAdjusted * (1 - ctx.tolerance)) return null;
    const imbalance = givenAdjusted > 0 ? Math.max(0, (givenAdjusted - receivedAdjusted) / givenAdjusted) : 0;
    maxImbalance = Math.max(maxImbalance, imbalance);

    const after = rosterAfter(team, legs);
    if (unfilledStarterSlots(after, ctx.rosterPositions) > ctx.unfilledBefore.get(rosterId)!) return null;

    const before = ctx.profiles.get(rosterId)!;
    const afterProfile = teamProfile(rosterId, after, ctx.needs);
    const fitGain = round2(before.deficitTotal - afterProfile.deficitTotal);
    fitScore += fitGain;
    const filled: Position[] = [];
    const opened: Position[] = [];
    for (const pos of POSITIONS) {
      const b = before.byPosition[pos].score;
      const a = afterProfile.byPosition[pos].score;
      if (b < 0 && a > b) filled.push(pos);
      if (a <= -0.5 && a < b) opened.push(pos);
    }

    outcomes.push({
      rosterId,
      name: team.name,
      gives,
      receives,
      givenValue: sum(gives.map((p) => p.value)),
      receivedValue: sum(receives.map((p) => p.value)),
      givenAdjusted: Math.round(givenAdjusted),
      receivedAdjusted: Math.round(receivedAdjusted),
      netPct: givenAdjusted > 0 ? round3((receivedAdjusted - givenAdjusted) / givenAdjusted) : 0,
      fitGain,
      filled,
      opened,
    });
  }

  const disruption = legs.reduce((n, l) => n + l.players.length, 0);
  const fairness = ctx.tolerance > 0 ? 1 - maxImbalance / ctx.tolerance : 1;
  const score = fairness + 0.35 * clamp(fitScore, -2, 3) - 0.05 * disruption;
  const id = legs
    .map((l) => `${l.from}>${l.to}:${l.players.map((p) => p.id).sort().join(",")}`)
    .sort()
    .join("|");
  return {
    id,
    mode,
    legs,
    teams: outcomes,
    maxImbalancePct: round3(maxImbalance),
    fitScore: round2(fitScore),
    disruption,
    score: round3(score),
  };
}

// ---------- Search ----------

export function combinations<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length > 0) out.push([...acc]);
    if (acc.length === maxSize) return;
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

const MY_POOL_2TEAM = 16;
const ADDON_POOL = 12;
const POOL_3TEAM = 5;
const MY_POOL_3TEAM_B = 8;

function topValued(players: EnginePlayer[], n: number, filter: (p: EnginePlayer) => boolean = () => true) {
  return players
    .filter((p) => p.value > 0 && filter(p))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/** Cheap pre-filter on raw sums; the max consolidation premium is bounded so this never drops a valid trade. */
function roughlyBalanced(give: number, get: number, tol: number) {
  const slack = 1 + CONSOLIDATION_RATE * MAX_EXTRA_PLAYERS + tol;
  return get * slack >= give && give * slack >= get;
}

function searchTwoTeam(ctx: SearchContext, me: EngineTeam, owner: EngineTeam, targets: EnginePlayer[]) {
  const results: TradeSuggestion[] = [];
  const targetSum = sum(targets.map((p) => p.value));
  const targetIds = new Set(targets.map((p) => p.id));
  const myPool = topValued(me.players, MY_POOL_2TEAM, (p) => p.value >= targetSum * 0.03);
  const addOns = topValued(owner.players, ADDON_POOL, (p) => !targetIds.has(p.id) && p.value < targetSum);

  for (const mine of combinations(myPool, 3)) {
    const mySum = sum(mine.map((p) => p.value));
    const options: EnginePlayer[][] = [[]];
    if (mySum > targetSum) for (const a of addOns) options.push([a]);
    for (const extra of options) {
      const get = targetSum + sum(extra.map((p) => p.value));
      if (!roughlyBalanced(mySum, get, ctx.tolerance)) continue;
      const legs: TradeLeg[] = [
        { from: owner.rosterId, to: me.rosterId, players: [...targets, ...extra] },
        { from: me.rosterId, to: owner.rosterId, players: mine },
      ];
      const s = evaluateTrade(legs, ctx, 2);
      if (s) results.push(s);
    }
  }
  return results;
}

/** A leg may not send more starter-caliber players at a position than the giver's surplus there. */
function withinSurplus(players: EnginePlayer[], profile: NeedsProfile, needs: NeedsContext) {
  const counts = new Map<Position, number>();
  for (const p of players) {
    const pos = p.position as Position;
    if (!profile.byPosition[pos] || p.value < needs.thresholds[pos]) continue;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  for (const [pos, n] of counts) if (n > Math.max(1, Math.floor(profile.byPosition[pos].score + 0.5))) return false;
  return true;
}

const positionsOf = (xs: { position: string }[]) => new Set<string>(xs.map((x) => x.position));
const intersects = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * Needs-driven 3-team search. I get the targets from B; partner C must complement:
 * C has excess where B (or I) am deficient, and C is deficient where I have excess.
 *  Flow A (cycle):  B -> me (targets), me -> C, C -> B
 *  Flow B:          B -> me (targets), me -> B, C -> me (fills my post-trade hole), me -> C
 * Legs carry at most 2 players drawn from the giver's top players at excess positions.
 */
function searchThreeTeam(ctx: SearchContext, me: EngineTeam, owner: EngineTeam, targets: EnginePlayer[]) {
  const results: TradeSuggestion[] = [];
  const myProfile = ctx.profiles.get(me.rosterId)!;
  const bProfile = ctx.profiles.get(owner.rosterId)!;
  const myExcess = positionsOf(myProfile.excess);
  // Positions where I'm deficient now or would be after giving away one starter.
  const myThin = new Set<string>(POSITIONS.filter((pos) => myProfile.byPosition[pos].score - 1 <= -0.5));
  const bDeficits = positionsOf(bProfile.deficits);
  const targetLeg: TradeLeg = { from: owner.rosterId, to: me.rosterId, players: targets };
  const targetSum = sum(targets.map((p) => p.value));
  const targetIds = new Set(targets.map((p) => p.id));

  for (const c of ctx.teams.values()) {
    if (c.rosterId === me.rosterId || c.rosterId === owner.rosterId) continue;
    const cProfile = ctx.profiles.get(c.rosterId)!;
    const cExcess = positionsOf(cProfile.excess);
    const cDeficits = positionsOf(cProfile.deficits);
    const helpsB = intersects(cExcess, bDeficits);
    const helpsMe = intersects(cExcess, myThin);
    if (!intersects(cDeficits, myExcess) || !(helpsB || helpsMe)) continue;

    const meToCPool = topValued(me.players, POOL_3TEAM, (p) => myExcess.has(p.position) && !targetIds.has(p.id));
    const meToC = combinations(meToCPool, 2).filter(
      (xs) => xs.some((p) => cDeficits.has(p.position)) && withinSurplus(xs, myProfile, ctx.needs),
    );
    const cPool = topValued(c.players, POOL_3TEAM, (p) => cExcess.has(p.position));

    if (helpsB) {
      const cToB = combinations(cPool, 2).filter(
        (xs) => xs.some((p) => bDeficits.has(p.position)) && withinSurplus(xs, cProfile, ctx.needs),
      );
      for (const x of meToC) {
        const xSum = sum(x.map((p) => p.value));
        if (!roughlyBalanced(xSum, targetSum, ctx.tolerance)) continue;
        for (const y of cToB) {
          const ySum = sum(y.map((p) => p.value));
          if (!roughlyBalanced(ySum, xSum, ctx.tolerance) || !roughlyBalanced(targetSum, ySum, ctx.tolerance)) continue;
          const legs: TradeLeg[] = [
            targetLeg,
            { from: me.rosterId, to: c.rosterId, players: x },
            { from: c.rosterId, to: owner.rosterId, players: y },
          ];
          const s = evaluateTrade(legs, ctx, 3);
          if (s) results.push(s);
        }
      }
    }

    if (!helpsMe) continue;
    // Flow B: C backfills a hole I open by paying B.
    const meToBPool = topValued(me.players, MY_POOL_3TEAM_B, (p) => !targetIds.has(p.id));
    for (const z of combinations(meToBPool, 2)) {
      const zSum = sum(z.map((p) => p.value));
      if (!roughlyBalanced(zSum, targetSum, ctx.tolerance)) continue;
      const zIds = new Set(z.map((p) => p.id));
      for (const x of meToC) {
        if (x.some((p) => zIds.has(p.id))) continue;
        const myAfterGive = rosterAfter(me, [
          targetLeg,
          { from: me.rosterId, to: owner.rosterId, players: z },
          { from: me.rosterId, to: c.rosterId, players: x },
        ]);
        const holes = positionsOf(teamProfile(me.rosterId, myAfterGive, ctx.needs).deficits);
        const xSum = sum(x.map((p) => p.value));
        const cToMe = combinations(
          cPool.filter((p) => holes.has(p.position)),
          2,
        ).filter((xs) => withinSurplus(xs, cProfile, ctx.needs));
        for (const w of cToMe) {
          if (!roughlyBalanced(xSum, sum(w.map((p) => p.value)), ctx.tolerance)) continue;
          const legs: TradeLeg[] = [
            targetLeg,
            { from: me.rosterId, to: owner.rosterId, players: z },
            { from: c.rosterId, to: me.rosterId, players: w },
            { from: me.rosterId, to: c.rosterId, players: x },
          ];
          const s = evaluateTrade(legs, ctx, 3);
          if (s) results.push(s);
        }
      }
    }
  }
  return results;
}

/** Keeps results varied: at most this many suggestions where I give the exact same players. */
const MAX_PER_OUTGOING = 2;

function outgoingKey(s: TradeSuggestion, myRosterId: number) {
  return s.legs
    .filter((l) => l.from === myRosterId)
    .flatMap((l) => l.players.map((p) => p.id))
    .sort()
    .join(",");
}

export function suggestTrades(req: TradeRequest): TradeResponse {
  const warnings: string[] = [];
  const limit = req.limit ?? 10;
  const teams = new Map(req.teams.map((t) => [t.rosterId, t]));
  const me = teams.get(req.myRosterId);
  if (!me) throw new Error(`Roster ${req.myRosterId} not found in league`);

  const needs = buildNeedsContext(req.teams, req.rosterPositions);
  const profiles = leagueProfiles(req.teams, needs);
  const ctx: SearchContext = {
    teams,
    needs,
    profiles,
    tolerance: req.tolerance,
    rosterPositions: req.rosterPositions,
    unfilledBefore: new Map(req.teams.map((t) => [t.rosterId, unfilledStarterSlots(t.players, req.rosterPositions)])),
  };

  const byOwner = new Map<number, EnginePlayer[]>();
  for (const id of new Set(req.targetPlayerIds)) {
    const owner = req.teams.find((t) => t.players.some((p) => p.id === id));
    if (!owner) {
      warnings.push(`Player ${id} is not on any roster.`);
      continue;
    }
    if (owner.rosterId === me.rosterId) {
      warnings.push(`${owner.players.find((p) => p.id === id)!.name} is already on your roster.`);
      continue;
    }
    const player = owner.players.find((p) => p.id === id)!;
    if (player.value <= 0) {
      warnings.push(`${player.name} has no value in the current snapshot, so no trade can be priced.`);
      continue;
    }
    byOwner.set(owner.rosterId, [...(byOwner.get(owner.rosterId) ?? []), player]);
  }

  let all: TradeSuggestion[] = [];
  for (const [ownerId, targets] of byOwner) {
    const owner = teams.get(ownerId)!;
    if (req.mode === 2) {
      all.push(...searchTwoTeam(ctx, me, owner, targets));
    } else if (targets.length > 2) {
      warnings.push(`3-team trades support at most 2 targets from ${owner.name}.`);
    } else {
      all.push(...searchThreeTeam(ctx, me, owner, targets));
    }
  }

  const seen = new Set<string>();
  const perOutgoing = new Map<string, number>();
  all = all
    .sort((a, b) => b.score - a.score || a.disruption - b.disruption)
    .filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      const key = outgoingKey(s, me.rosterId);
      const n = perOutgoing.get(key) ?? 0;
      if (n >= MAX_PER_OUTGOING) return false;
      perOutgoing.set(key, n + 1);
      return true;
    })
    .slice(0, limit);

  if (byOwner.size > 0 && all.length === 0) {
    warnings.push(
      req.mode === 3
        ? "No 3-team trade fits the tolerance and complementary needs. Try a wider tolerance or a 2-team search."
        : "No trade fits the tolerance without breaking a starting lineup. Try a wider tolerance.",
    );
  }
  return { suggestions: all, profiles: [...profiles.values()], warnings };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
