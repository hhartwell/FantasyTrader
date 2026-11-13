import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RankingSnapshotProvider, type RankingSnapshot } from "../src/values/rankingSnapshot.js";
import {
  matchSleeperPlayer,
  sleeperAdpFor,
  sleeperBasis,
  valueFromRank,
  type SleeperAdp,
} from "../src/values/rankValue.js";
import { missingValuesMessage, parseValueSource } from "../src/values/valueSource.js";
import type { ValuesParams } from "../src/values/snapshotFiles.js";

const params = (over: Partial<ValuesParams> = {}): ValuesParams => ({
  isDynasty: true,
  numQbs: 1,
  numTeams: 12,
  ppr: 1,
  tep: "none",
  ...over,
});

const adp = (over: Partial<SleeperAdp> = {}): SleeperAdp => ({
  ppr: null,
  half: null,
  std: null,
  sf: null,
  dynastyPpr: null,
  dynastyHalf: null,
  dynastyStd: null,
  dynastySf: null,
  ...over,
});

describe("rank to trade value", () => {
  it("makes the top pick worth 10,000 and falls off with the square root", () => {
    expect(valueFromRank(1)).toBe(10000);
    expect(valueFromRank(4)).toBe(5000);
    expect(valueFromRank(9)).toBeLessThan(valueFromRank(4));
    expect(valueFromRank(0)).toBe(0);
    expect(valueFromRank(Number.NaN)).toBe(0);
  });

  it("picks the ADP column for the league format and drops placeholders", () => {
    const row = adp({ ppr: 12, half: 20, std: 30, sf: 8, dynastyPpr: 3, dynastyHalf: 4, dynastyStd: 6, dynastySf: 2 });
    expect(sleeperAdpFor(row, params())).toBe(3);
    expect(sleeperAdpFor(row, params({ isDynasty: false, ppr: 0.5 }))).toBe(20);
    expect(sleeperAdpFor(row, params({ numQbs: 2 }))).toBe(2);
    expect(sleeperAdpFor(row, params({ isDynasty: false, numQbs: 2 }))).toBe(8);
    expect(sleeperAdpFor(adp({ dynastyPpr: 999 }), params())).toBeNull();
  });

  it("describes the Sleeper board that was actually used", () => {
    expect(sleeperBasis(params({ numQbs: 2 }))).toContain("superflex ADP is not split by PPR");
    expect(sleeperBasis(params())).toContain("TE premium is not included");
  });
});

describe("Yahoo to Sleeper matching", () => {
  const players = [
    { id: "1", name: "Ja'Marr Chase", position: "WR", team: "CIN", yahooId: "33393" },
    { id: "2", name: "James Cook III", position: "RB", team: "BUF" },
    { id: "3", name: "Mike Williams", position: "WR", team: null },
    { id: "4", name: "Mike Williams", position: "WR", team: null },
  ];

  it("matches a Yahoo id, then a normalized name, and skips ambiguous names", () => {
    expect(matchSleeperPlayer({ yahooId: "33393", name: "Someone Else", position: "WR" }, players)?.id).toBe("1");
    expect(matchSleeperPlayer({ yahooId: "9", name: "James Cook", position: "RB" }, players)?.id).toBe("2");
    expect(matchSleeperPlayer({ yahooId: "9", name: "Mike Williams", position: "WR" }, players)).toBeNull();
  });
});

describe("ranking snapshots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ranks-"));
  const sleeperFile = path.join(dir, "sleeper.json");
  const yahooFile = path.join(dir, "yahoo.json");
  const sleeperSnap: RankingSnapshot = {
    source: "sleeper",
    fetchedAt: "2026-11-13T00:00:00Z",
    season: "2026",
    players: [
      { sleeperId: "10", name: "Star", position: "WR", team: "CIN", adp: adp({ dynastyPpr: 1, ppr: 4 }) },
      { sleeperId: "11", name: "Depth", position: "RB", team: "BUF", adp: adp({ dynastyPpr: 36 }) },
    ],
  };
  const yahooSnap: RankingSnapshot = {
    source: "yahoo",
    fetchedAt: "2026-11-13T00:00:00Z",
    season: "2026",
    players: [{ sleeperId: "10", name: "Star", position: "WR", team: "CIN", overall: 4 }],
  };
  fs.writeFileSync(sleeperFile, JSON.stringify(sleeperSnap));
  fs.writeFileSync(yahooFile, JSON.stringify(yahooSnap));

  it("values Sleeper ADP and reports when TE premium was requested", () => {
    const provider = new RankingSnapshotProvider(sleeperFile, { name: "Sleeper", url: "https://sleeper.com" }, "sleeper");
    const res = provider.getValues(params())!;
    expect(res.exact).toBe(true);
    expect(res.values.get("10")!.value).toBe(10000);
    expect(res.values.get("11")!.value).toBeLessThan(2000);
    const tep = provider.getValues(params({ tep: "te+" }))!;
    expect(tep.exact).toBe(false);
    expect(tep.used.tep).toBe("none");
    expect(provider.summary()?.players).toBe(2);
  });

  it("values Yahoo's overall rank on one board for every format", () => {
    const provider = new RankingSnapshotProvider(yahooFile, { name: "Yahoo Fantasy", url: "https://football.fantasysports.yahoo.com" }, "yahoo");
    const res = provider.getValues(params({ ppr: 0, numQbs: 2, tep: "te++" }))!;
    expect(res.exact).toBe(true);
    expect(res.values.get("10")!.value).toBe(5000);
    expect(res.basis).toMatch(/Yahoo overall rank/);
  });

  it("returns null when the snapshot is missing", () => {
    const provider = new RankingSnapshotProvider(path.join(dir, "missing.json"), { name: "Sleeper", url: "https://sleeper.com" }, "sleeper");
    expect(provider.getValues(params())).toBeNull();
  });
});

describe("value source setting", () => {
  it("defaults unknown sources to FantasyCalc only when that source is enabled", () => {
    expect(parseValueSource("sleeper", true)).toBe("sleeper");
    expect(parseValueSource("yahoo", false)).toBe("yahoo");
    expect(parseValueSource("espn", true)).toBe("fantasycalc");
    expect(parseValueSource("fantasycalc", false)).toBe("sleeper");
    expect(parseValueSource("espn", false)).toBe("sleeper");
    expect(missingValuesMessage("yahoo")).toMatch(/pull-rankings/);
  });
});
