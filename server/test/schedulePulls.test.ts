import { describe, expect, it } from "vitest";
import { BEAT_INTERVAL_MS, BeatLock, pullJobs } from "../scripts/schedulePulls.js";

describe("pull beat", () => {
  it("wakes once an hour", () => {
    expect(BEAT_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  it("pulls players and rankings, and FantasyCalc only when enabled", () => {
    expect(pullJobs(false).map((job) => job.id)).toEqual(["players", "rankings"]);
    const enabled = pullJobs(true);
    expect(enabled.map((job) => job.id)).toEqual(["players", "rankings", "values"]);
    expect(enabled.find((job) => job.id === "values")?.npmArgs).toEqual([
      "run",
      "data:pull-values",
      "--",
      "--tep=all",
      "--delay-ms=5000",
    ]);
  });

  it("refuses a second tick until the first one finishes", () => {
    const lock = new BeatLock();
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    lock.release();
    expect(lock.tryAcquire()).toBe(true);
  });
});
