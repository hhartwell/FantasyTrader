import { describe, expect, it } from "vitest";
import { canonicalSwid, defaultEspnSeason, parseEspnLookup } from "./espn";

describe("ESPN lookup", () => {
  it("reads a league id or a league URL", () => {
    expect(parseEspnLookup("336358", "2025")).toEqual({ leagueId: "336358", season: "2025" });
    expect(
      parseEspnLookup("https://fantasy.espn.com/football/league?leagueId=336358&seasonId=2024", "2026"),
    ).toEqual({ leagueId: "336358", season: "2024" });
    expect(() => parseEspnLookup("not a league", "2026")).toThrow(/league id/);
    expect(() => parseEspnLookup("12", "season")).toThrow(/four-digit/);
  });

  it("defaults the season and normalizes a SWID", () => {
    expect(defaultEspnSeason(new Date(2026, 0, 15))).toBe("2025");
    expect(defaultEspnSeason(new Date(2026, 10, 14))).toBe("2026");
    expect(canonicalSwid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
    expect(canonicalSwid("nope")).toBeNull();
  });
});
