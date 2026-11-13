import { describe, expect, it } from "vitest";
import { buildNeedsContext, leagueProfiles } from "../src/positionalNeeds.js";
import { chooseWaiverDrops, combinations, compareSides, suggestTrades, type EnginePlayer, type EngineTeam } from "../src/tradeEngine.js";
import { fixtureLeague, ROSTER_POSITIONS } from "./fixtures.js";

describe("compareSides (consolidation adjustment)", () => {
  it("adds no premium when both sides send the same number of players", () => {
    expect(compareSides([5000, 3000], [4000, 4000])).toEqual({ a: 8000, b: 8000 });
  });

  it("makes one star worth more than two halves", () => {
    const { a, b } = compareSides([10000], [5000, 5000]);
    expect(b).toBe(10000);
    expect(a).toBeGreaterThan(10000);
  });

  it("gives a bigger premium against more depth pieces", () => {
    const two = compareSides([9000], [4500, 4500]).a;
    const three = compareSides([9000], [3000, 3000, 3000]).a;
    expect(three).toBeGreaterThan(two);
  });

  it("shrinks the premium when the bigger side also has a star", () => {
    const vsDepth = compareSides([9000], [5000, 4000]).a;
    const vsStar = compareSides([9000], [8500, 500]).a;
    expect(vsStar).toBeLessThan(vsDepth);
  });
});

describe("combinations", () => {
  it("enumerates subsets up to the max size", () => {
    expect(combinations([1, 2, 3], 2)).toHaveLength(6);
    expect(combinations([1, 2, 3, 4], 3)).toHaveLength(14);
  });
});

describe("suggestTrades: 2-team", () => {
  const { teams, star } = fixtureLeague();
  const res = suggestTrades({
    teams,
    rosterPositions: ROSTER_POSITIONS,
    myRosterId: 1,
    targetPlayerIds: [star.id],
    mode: 2,
    tolerance: 0.1,
  });

  it("returns ranked trades that bring me the target", () => {
    expect(res.suggestions.length).toBeGreaterThan(0);
    for (const s of res.suggestions) {
      expect(s.mode).toBe(2);
      const me = s.teams.find((t) => t.rosterId === 1)!;
      expect(me.receives.map((p) => p.id)).toContain(star.id);
      for (const team of s.teams) expect(team.drops).toEqual([]);
    }
    const scores = res.suggestions.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("keeps every team within tolerance", () => {
    for (const s of res.suggestions) {
      for (const t of s.teams) expect(t.receivedAdjusted).toBeGreaterThanOrEqual(t.givenAdjusted * 0.9 - 1);
      expect(s.maxImbalancePct).toBeLessThanOrEqual(0.1);
    }
  });

  it("credits filling my RB need", () => {
    const top = res.suggestions[0].teams.find((t) => t.rosterId === 1)!;
    expect(top.filled).toContain("RB");
    expect(top.fitGain).toBeGreaterThan(0);
  });

  it("returns more trades with a wider tolerance", () => {
    const wide = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      mode: 2,
      tolerance: 0.2,
      limit: 1000,
    });
    const tight = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      mode: 2,
      tolerance: 0.03,
      limit: 1000,
    });
    expect(wide.suggestions.length).toBeGreaterThan(tight.suggestions.length);
  });

  it("never sends a player kept off the trade block, and still counts them on the roster", () => {
    const outgoing = new Set(
      res.suggestions.flatMap((s) => s.teams.find((t) => t.rosterId === 1)!.gives.map((p) => p.id)),
    );
    const kept = [...outgoing][0];
    expect(kept).toBeTruthy();
    const closed = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      excludedPlayerIds: [kept],
      mode: 2,
      tolerance: 0.1,
      limit: 1000,
    });
    expect(closed.suggestions.length).toBeGreaterThan(0);
    for (const s of closed.suggestions) {
      expect(s.teams.find((t) => t.rosterId === 1)!.gives.map((p) => p.id)).not.toContain(kept);
    }
    expect(closed.profiles.find((p) => p.rosterId === 1)).toEqual(res.profiles.find((p) => p.rosterId === 1));
  });
});

describe("suggestTrades: positional sanity", () => {
  it("rejects trades that leave a team unable to field a starting lineup", () => {
    const { teams } = fixtureLeague();
    // B's only TE is the target: taking it would leave B without a TE unless the trade returns one.
    const bTe = teams[1].players.find((p) => p.position === "TE")!;
    bTe.value = 4000;
    const res = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [bTe.id],
      mode: 2,
      tolerance: 0.15,
      limit: 1000,
    });
    for (const s of res.suggestions) {
      const b = s.teams.find((t) => t.rosterId === 2)!;
      expect(b.receives.some((p) => p.position === "TE")).toBe(true);
    }
  });
});

describe("suggestTrades: 3-team", () => {
  const { teams, star } = fixtureLeague();
  const res = suggestTrades({
    teams,
    rosterPositions: ROSTER_POSITIONS,
    myRosterId: 1,
    targetPlayerIds: [star.id],
    mode: 3,
    tolerance: 0.1,
    limit: 1000,
  });

  it("finds a needs-driven partner: my WRs to C, C's TE to B", () => {
    expect(res.suggestions.length).toBeGreaterThan(0);
    const cycle = res.suggestions.find((s) =>
      s.legs.some((l) => l.from === 1 && l.to === 3 && l.players.every((p) => p.position === "WR")) &&
      s.legs.some((l) => l.from === 3 && l.to === 2 && l.players.some((p) => p.position === "TE")),
    );
    expect(cycle).toBeDefined();
    const b = cycle!.teams.find((t) => t.rosterId === 2)!;
    expect(b.filled).toContain("TE");
  });

  it("involves three teams, caps legs at 2 players (except the target leg), and respects tolerance", () => {
    for (const s of res.suggestions) {
      expect(s.mode).toBe(3);
      expect(new Set(s.legs.flatMap((l) => [l.from, l.to])).size).toBe(3);
      for (const l of s.legs) expect(l.players.length).toBeLessThanOrEqual(2);
      for (const t of s.teams) expect(t.receivedAdjusted).toBeGreaterThanOrEqual(t.givenAdjusted * 0.9 - 1);
    }
  });

  it("never sends more starter-caliber players at a position than the giver's surplus", () => {
    const { teams: t2, star: s2 } = fixtureLeague();
    // Give me a second starter QB (surplus of exactly 1) and make C need a QB.
    t2[0].players.push({ id: "qb2", name: "Backup QB", position: "QB", value: 5800 });
    t2[2].players.find((p) => p.position === "QB")!.value = 100;
    const needs = buildNeedsContext(t2, ROSTER_POSITIONS);
    const before = leagueProfiles(t2, needs);
    const out = suggestTrades({
      teams: t2,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [s2.id],
      mode: 3,
      tolerance: 0.15,
      limit: 1000,
    });
    expect(out.suggestions.length).toBeGreaterThan(0);
    for (const s of out.suggestions) {
      for (const leg of s.legs.filter((l) => l.from !== 2)) {
        const qbs = leg.players.filter((p) => p.position === "QB" && p.value >= needs.thresholds.QB).length;
        expect(qbs).toBeLessThanOrEqual(Math.max(1, Math.floor(before.get(leg.from)!.byPosition.QB.score + 0.5)));
      }
    }
  });

  it("only partners with teams whose needs complement (never team D, which has no WR need)", () => {
    for (const s of res.suggestions) expect(s.teams.map((t) => t.rosterId)).not.toContain(4);
  });

  it("includes the C-backfills-me flow when paying B opens a hole on my roster", () => {
    const flowB = res.suggestions.find((s) => s.legs.some((l) => l.from === 3 && l.to === 1));
    expect(flowB).toBeDefined();
    expect(flowB!.legs.some((l) => l.from === 1 && l.to === 2)).toBe(true);
  });

  it("keeps the default top results varied", () => {
    const top = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      mode: 3,
      tolerance: 0.1,
    }).suggestions;
    const counts = new Map<string, number>();
    for (const s of top) {
      const key = s.legs
        .filter((l) => l.from === 1)
        .flatMap((l) => l.players.map((p) => p.id))
        .sort()
        .join();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
});

const FULL: string[] = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN"];

const player = (id: string, position: string, value: number, held?: EnginePlayer["held"]): EnginePlayer => ({
  id,
  name: id,
  position,
  value,
  ...(held ? { held } : {}),
});

describe("waiver drops", () => {
  const spots = FULL;

  it("cuts the cheapest player that still leaves a starting lineup", () => {
    const roster = [
      player("qb", "QB", 4000),
      player("rb1", "RB", 3000),
      player("rb2", "RB", 2500),
      player("wr1", "WR", 3000),
      player("wr2", "WR", 2500),
      player("te", "TE", 50),
      player("wr3", "WR", 2000),
      player("flex", "WR", 1500),
      player("scrub", "WR", 100),
    ];
    expect(chooseWaiverDrops(roster, 8, 8, spots, new Set())?.map((p) => p.id)).toEqual(["scrub"]);
  });

  it("does not drop a kicker or a defense when a skill player can be cut", () => {
    const roster = [
      player("qb", "QB", 4000),
      player("rb1", "RB", 3000),
      player("rb2", "RB", 2500),
      player("wr1", "WR", 3000),
      player("wr2", "WR", 2500),
      player("te", "TE", 50),
      player("wr3", "WR", 2000),
      player("flex", "WR", 1500),
      player("scrub", "WR", 100),
      player("k", "K", 5),
      player("def", "DEF", 1),
    ];
    expect(chooseWaiverDrops(roster, 10, 10, [...FULL, "K", "DEF"], new Set())?.map((p) => p.id)).toEqual(["scrub"]);
  });

  it("will not cut a kept player, a taxi player, or the last starter at a position", () => {
    const roster = [
      player("qb", "QB", 4000),
      player("rb1", "RB", 3000),
      player("rb2", "RB", 2500),
      player("wr1", "WR", 3000),
      player("wr2", "WR", 2500),
      player("te", "TE", 50),
      player("wr3", "WR", 2000),
      player("flex", "WR", 1500),
      player("scrub", "WR", 100),
      player("taxi", "WR", 1, "taxi"),
    ];
    expect(chooseWaiverDrops(roster, 8, 8, spots, new Set(["scrub"]))?.map((p) => p.id)).toEqual(["flex"]);
    expect(chooseWaiverDrops(roster, 8, 8, spots, new Set(["scrub", "flex", "wr3", "wr2", "wr1"]))).toBeNull();
  });

  it("does not cut just to repair a roster that was already over the limit", () => {
    const roster = [player("qb", "QB", 4000), player("rb", "RB", 3000)];
    expect(chooseWaiverDrops(roster, 1, 2, ["QB"], new Set())).toEqual([]);
  });

  it("charges the dropped player's value to the team that has to clear a spot", () => {
    const { teams, payA, payB, star, scrub } = fullLeague(100);
    const res = suggestTrades({
      teams,
      rosterPositions: FULL,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      excludedPlayerIds: teams[0].players.filter((p) => p.id !== payA.id && p.id !== payB.id).map((p) => p.id),
      mode: 2,
      tolerance: 0.1,
      limit: 20,
    });
    expect(res.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of res.suggestions) {
      const partner = suggestion.teams.find((t) => t.rosterId === 2)!;
      expect(partner.drops.map((p) => p.id)).toEqual([scrub.id]);
      expect(partner.givenValue).toBe(star.value + scrub.value);
      expect(suggestion.teams.find((t) => t.rosterId === 1)!.drops).toEqual([]);
    }
  });

  it("rejects the trade when the drop is too valuable, and allows it when a bench spot is open", () => {
    const tight = suggestTrades({
      ...fullRequest(fullLeague(2000), FULL),
    });
    expect(tight.suggestions).toHaveLength(0);
    expect(tight.warnings.some((w) => /waivers/.test(w))).toBe(true);

    const open = suggestTrades({
      ...fullRequest(fullLeague(2000), [...FULL, "BN"]),
    });
    expect(open.suggestions.length).toBeGreaterThan(0);
    expect(open.suggestions[0].teams.find((t) => t.rosterId === 2)!.drops).toEqual([]);
  });

  it("drops the next-cheapest player when the cheapest one is kept", () => {
    const me: EngineTeam = {
      rosterId: 1,
      name: "Me",
      players: [
        player("qb", "QB", 4000),
        player("rb1", "RB", 3000),
        player("rb2", "RB", 2800),
        player("pay", "WR", 6000),
        player("wr", "WR", 4000),
        player("te", "TE", 2500),
        player("scrub", "WR", 50),
        player("cheap", "WR", 80),
      ],
    };
    const star = player("star", "RB", 5000);
    const addon = player("addon", "WR", 1000);
    const partner: EngineTeam = {
      rosterId: 2,
      name: "B",
      players: [
        player("bqb", "QB", 4000),
        star,
        player("brb1", "RB", 3000),
        player("brb2", "RB", 2000),
        player("bwr1", "WR", 3000),
        player("bwr2", "WR", 2800),
        player("bte", "TE", 2500),
        addon,
      ],
    };
    const res = suggestTrades({
      teams: [me, partner],
      rosterPositions: FULL,
      myRosterId: 1,
      targetPlayerIds: [star.id],
      excludedPlayerIds: ["qb", "rb1", "rb2", "wr", "te", "scrub"],
      mode: 2,
      tolerance: 0.1,
      limit: 20,
    });
    const hit = res.suggestions.find((s) => {
      const mine = s.teams.find((t) => t.rosterId === 1)!;
      return mine.gives.length === 1 && mine.gives[0].id === "pay" && mine.receives.some((p) => p.id === "addon");
    });
    expect(hit).toBeDefined();
    expect(hit!.teams.find((t) => t.rosterId === 1)!.drops.map((p) => p.id)).toEqual(["cheap"]);
  });
});

function fullLeague(scrubValue: number) {
  const payA = player("payA", "WR", 2500);
  const payB = player("payB", "WR", 2500);
  const star = player("star", "RB", 5000);
  const scrub = player("scrub", "WR", scrubValue);
  const me: EngineTeam = {
    rosterId: 1,
    name: "Me",
    players: [
      player("qb", "QB", 4000),
      player("rb1", "RB", 3000),
      player("rb2", "RB", 2800),
      payA,
      payB,
      player("wrC", "WR", 4500),
      player("wrD", "WR", 4000),
      player("te", "TE", 2500),
    ],
  };
  const partner: EngineTeam = {
    rosterId: 2,
    name: "B",
    players: [
      player("bqb", "QB", 4000),
      star,
      player("brb1", "RB", 3000),
      player("brb2", "RB", 2000),
      player("bwr1", "WR", 3000),
      player("bwr2", "WR", 2800),
      player("bte", "TE", 2500),
      scrub,
    ],
  };
  return { teams: [me, partner], payA, payB, star, scrub };
}

function fullRequest(league: ReturnType<typeof fullLeague>, rosterPositions: string[]) {
  return {
    teams: league.teams,
    rosterPositions,
    myRosterId: 1,
    targetPlayerIds: [league.star.id],
    excludedPlayerIds: league.teams[0].players
      .filter((p) => p.id !== league.payA.id && p.id !== league.payB.id)
      .map((p) => p.id),
    mode: 2 as const,
    tolerance: 0.1,
    limit: 20,
  };
}

describe("suggestTrades: warnings", () => {
  it("warns about targets already on my roster", () => {
    const { teams } = fixtureLeague();
    const mine = teams[0].players[0];
    const res = suggestTrades({
      teams,
      rosterPositions: ROSTER_POSITIONS,
      myRosterId: 1,
      targetPlayerIds: [mine.id],
      mode: 2,
      tolerance: 0.1,
    });
    expect(res.suggestions).toHaveLength(0);
    expect(res.warnings[0]).toMatch(/already on your roster/);
  });
});
