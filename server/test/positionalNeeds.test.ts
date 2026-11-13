import { describe, expect, it } from "vitest";
import {
  buildNeedsContext,
  leagueProfiles,
  lineupRequirements,
  starterThresholds,
  unfilledStarterSlots,
} from "../src/positionalNeeds.js";
import { fixtureLeague, ROSTER_POSITIONS } from "./fixtures.js";

describe("lineupRequirements", () => {
  it("counts dedicated slots and spreads FLEX across RB/WR/TE", () => {
    const req = lineupRequirements(ROSTER_POSITIONS);
    expect(req.QB).toBe(1);
    expect(req.RB).toBeCloseTo(2.45);
    expect(req.WR).toBeCloseTo(2.45);
    expect(req.TE).toBeCloseTo(1.1);
  });

  it("spreads SUPER_FLEX mostly to QB and ignores K/DEF/BN", () => {
    const req = lineupRequirements(["QB", "SUPER_FLEX", "K", "DEF", "BN"]);
    expect(req.QB).toBeCloseTo(1.8);
    expect(req.RB + req.WR + req.TE).toBeCloseTo(0.2);
  });
});

describe("starterThresholds", () => {
  it("uses the Nth-best rostered value at each position", () => {
    const { teams } = fixtureLeague();
    const t = starterThresholds(teams, lineupRequirements(ROSTER_POSITIONS));
    expect(t.QB).toBe(4000); // 4 teams x 1 QB
    expect(t.RB).toBe(3000); // round(4 x 2.45) = 10th best RB
    expect(t.WR).toBe(2600);
    expect(t.TE).toBe(2500); // round(4 x 1.1) = 4th best TE
  });
});

describe("team needs profiles", () => {
  const { teams } = fixtureLeague();
  const profiles = leagueProfiles(teams, buildNeedsContext(teams, ROSTER_POSITIONS));

  it("finds my WR surplus and RB deficit", () => {
    const me = profiles.get(1)!;
    expect(me.excess.map((e) => e.position)).toContain("WR");
    expect(me.deficits.map((d) => d.position)).toContain("RB");
    expect(me.byPosition.WR.score).toBeCloseTo(2.55);
  });

  it("finds B's TE deficit and C's TE/RB surplus with WR deficit", () => {
    expect(profiles.get(2)!.deficits.map((d) => d.position)).toEqual(["TE"]);
    const c = profiles.get(3)!;
    expect(c.excess.map((e) => e.position)).toEqual(["TE", "RB"]);
    expect(c.deficits[0]).toEqual({ position: "WR", magnitude: 2.45 });
  });
});

describe("unfilledStarterSlots", () => {
  it("is zero for a complete roster and counts missing starters", () => {
    const { teams } = fixtureLeague();
    expect(unfilledStarterSlots(teams[0].players, ROSTER_POSITIONS)).toBe(0);
    const noTe = teams[0].players.filter((p) => p.position !== "TE");
    expect(unfilledStarterSlots(noTe, ROSTER_POSITIONS)).toBe(1);
    const thin = [{ id: "q", position: "QB", value: 1 }];
    // RB, RB, WR, WR, TE, FLEX all empty
    expect(unfilledStarterSlots(thin, ROSTER_POSITIONS)).toBe(6);
  });

  it("ignores zero-value players", () => {
    expect(unfilledStarterSlots([{ id: "q", position: "QB", value: 0 }], ["QB"])).toBe(1);
  });
});
