import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectValuesParams, SleeperClient, type SleeperLeague } from "../src/sleeper.js";
import { FantasyCalcSnapshotProvider, pickNearest } from "../src/values/fantasyCalcSnapshot.js";
import {
  MIN_REFETCH_MS,
  PULL_MATRIX,
  isWithinGuard,
  parseSnapshotFileName,
  snapshotFileName,
  type ValuesParams,
  type ValuesSnapshot,
} from "../src/values/snapshotFiles.js";

const p = (isDynasty: boolean, numQbs: 1 | 2, numTeams: number, ppr: 0 | 0.5 | 1): ValuesParams => ({
  isDynasty,
  numQbs,
  numTeams,
  ppr,
});

describe("snapshot files", () => {
  it("covers the full 36-combo matrix", () => {
    expect(PULL_MATRIX).toHaveLength(36);
  });

  it("round-trips file names", () => {
    const params = p(true, 2, 12, 0.5);
    expect(snapshotFileName(params)).toBe("true-2qb-12t-0.5ppr.json");
    expect(parseSnapshotFileName("true-2qb-12t-0.5ppr.json")).toEqual(params);
    expect(parseSnapshotFileName("notes.json")).toBeNull();
  });

  it("enforces the 3-hour refetch guard", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(isWithinGuard(new Date(now - MIN_REFETCH_MS + 60_000).toISOString(), now)).toBe(true);
    expect(isWithinGuard(new Date(now - MIN_REFETCH_MS - 60_000).toISOString(), now)).toBe(false);
    expect(isWithinGuard(undefined, now)).toBe(false);
  });
});

describe("nearest snapshot fallback", () => {
  const available = [p(true, 1, 12, 0.5), p(false, 1, 12, 0.5), p(true, 2, 12, 1)];

  it("prefers the exact match", () => {
    expect(pickNearest(p(true, 1, 12, 0.5), available)).toEqual(p(true, 1, 12, 0.5));
  });
  it("falls back to the closest team count within the same format", () => {
    expect(pickNearest(p(false, 1, 14, 0.5), available)).toEqual(p(false, 1, 12, 0.5));
  });
  it("keeps superflex over a PPR match", () => {
    expect(pickNearest(p(true, 2, 10, 0), available)).toEqual(p(true, 2, 12, 1));
  });
});

describe("FantasyCalcSnapshotProvider", () => {
  it("maps values by sleeperId, skips picks, and reports fallback", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-values-"));
    const snapshot: ValuesSnapshot = {
      source: "fantasycalc",
      fetchedAt: new Date().toISOString(),
      params: p(true, 1, 12, 0.5),
      values: [
        { player: { id: 1, name: "Star RB", sleeperId: "100", position: "RB" }, value: 9000 },
        { player: { id: 2, name: "2027 1st", sleeperId: null, position: "PICK" }, value: 5000 },
      ],
    };
    fs.writeFileSync(path.join(dir, snapshotFileName(snapshot.params)), JSON.stringify(snapshot));
    const provider = new FantasyCalcSnapshotProvider(dir);
    const res = provider.getValues(p(true, 1, 10, 0.5))!;
    expect(res.exact).toBe(false);
    expect(res.used).toEqual(snapshot.params);
    expect(res.values.get("100")?.value).toBe(9000);
    expect(res.values.size).toBe(1);
    expect(provider.status()[0].players).toBe(1);
  });

  it("returns null with no snapshots", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-empty-"));
    expect(new FantasyCalcSnapshotProvider(dir).getValues(p(true, 1, 12, 1))).toBeNull();
  });
});

describe("Sleeper client", () => {
  const league = (over: Partial<SleeperLeague>): SleeperLeague => ({
    league_id: "1",
    name: "L",
    season: "2026",
    status: "in_season",
    avatar: null,
    total_rosters: 12,
    roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN"],
    scoring_settings: { rec: 1 },
    settings: { type: 2 },
    ...over,
  });

  it("detects dynasty, superflex, team count, and PPR", () => {
    expect(detectValuesParams(league({}))).toEqual(p(true, 1, 12, 1));
    expect(
      detectValuesParams(
        league({
          settings: { type: 0 },
          roster_positions: ["QB", "SUPER_FLEX", "RB"],
          scoring_settings: { rec: 0.5 },
          total_rosters: 10,
        }),
      ),
    ).toEqual(p(false, 2, 10, 0.5));
    expect(detectValuesParams(league({ settings: { type: 1 }, scoring_settings: {} }))).toEqual(p(true, 1, 12, 0));
  });

  it("caches responses within the TTL", async () => {
    let calls = 0;
    const client = new SleeperClient(async () => {
      calls++;
      return [];
    });
    await client.getRosters("1");
    await client.getRosters("1");
    expect(calls).toBe(1);
  });
});
