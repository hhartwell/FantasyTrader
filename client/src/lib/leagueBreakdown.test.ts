import { describe, expect, it } from "vitest";
import type { LeagueTeam } from "../api";
import { leagueComparison, ordinal, positionValue } from "./leagueBreakdown";

const team = (rosterId: number, total: number, players: LeagueTeam["players"]): LeagueTeam => ({
  rosterId,
  ownerId: null,
  ownerName: `Owner ${rosterId}`,
  teamName: `Team ${rosterId}`,
  avatar: null,
  totalValue: total,
  players,
});

const player = (id: string, position: string, value: number) => ({
  id,
  name: id,
  position,
  team: null,
  age: null,
  value,
});

describe("leagueComparison", () => {
  const teams = [
    team(1, 1000, [player("qb", "QB", 400), player("wr", "WR", 500), player("k", "K", 100)]),
    team(2, 800, [player("qb2", "QB", 200), player("wr2", "WR", 600)]),
    team(3, 800, [player("qb3", "QB", 100), player("wr3", "WR", 700)]),
  ];

  it("leaves kickers out of a position total", () => {
    expect(positionValue(teams[0], "QB")).toBe(400);
    expect(positionValue(teams[0], "WR")).toBe(500);
  });

  it("ranks the selected team against the other rosters", () => {
    const comparison = leagueComparison(teams, 1)!;
    expect(comparison.rank).toBe(1);
    expect(comparison.teamCount).toBe(3);
    expect(comparison.restAverage).toBe(800);
    expect(comparison.versusRest).toBeCloseTo(0.25);
    expect(comparison.positions.find((row) => row.position === "WR")).toMatchObject({
      value: 500,
      rank: 3,
      restAverage: 650,
    });
    expect(comparison.positions.find((row) => row.position === "QB")?.shareOfBest).toBe(1);
  });

  it("gives tied teams the same rank", () => {
    const comparison = leagueComparison(teams, 2)!;
    expect(comparison.rank).toBe(2);
    expect(comparison.standings.filter((row) => row.rank === 2).map((row) => row.rosterId).sort()).toEqual([2, 3]);
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(13)).toBe("13th");
  });
});
