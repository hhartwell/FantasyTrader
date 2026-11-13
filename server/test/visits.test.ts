import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VisitError, VisitStore } from "../src/visits.js";

function tempStore(now: () => Date = () => new Date("2026-11-13T18:00:00Z"), maxDays = 400) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-visits-"));
  return new VisitStore(path.join(dir, "visits.json"), now, maxDays);
}

describe("unique visits", () => {
  it("counts a browser once per UTC day", () => {
    const visits = tempStore();
    expect(visits.record("browser-aaaa")).toEqual({ day: "2026-11-13", uniques: 1, newVisitor: true });
    expect(visits.record("browser-aaaa")).toEqual({ day: "2026-11-13", uniques: 1, newVisitor: false });
    expect(visits.record("browser-bbbb")).toMatchObject({ uniques: 2, newVisitor: true });
    expect(visits.report().days).toEqual([{ day: "2026-11-13", uniques: 2 }]);
  });

  it("starts a new count on the next UTC day and keeps history", () => {
    let now = new Date("2026-11-13T23:30:00Z");
    const visits = tempStore(() => now);
    visits.record("browser-aaaa");
    now = new Date("2026-11-14T00:30:00Z");
    expect(visits.record("browser-aaaa")).toEqual({ day: "2026-11-14", uniques: 1, newVisitor: true });
    expect(visits.report()).toEqual({
      timezone: "UTC",
      today: "2026-11-14",
      days: [
        { day: "2026-11-14", uniques: 1 },
        { day: "2026-11-13", uniques: 1 },
      ],
    });
  });

  it("persists across a restart", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-visits-")), "visits.json");
    const now = () => new Date("2026-11-13T12:00:00Z");
    new VisitStore(file, now).record("browser-aaaa");
    const again = new VisitStore(file, now);
    expect(again.record("browser-aaaa").newVisitor).toBe(false);
    expect(again.report().days).toEqual([{ day: "2026-11-13", uniques: 1 }]);
  });

  it("counts a repeated id in the file only once", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-visits-")), "visits.json");
    fs.writeFileSync(file, JSON.stringify({ days: { "2026-11-13": ["browser-aaaa", "browser-aaaa"] } }));
    const visits = new VisitStore(file, () => new Date("2026-11-13T12:00:00Z"));
    expect(visits.report().days).toEqual([{ day: "2026-11-13", uniques: 1 }]);
  });

  it("rejects an id that is not an anonymous token", () => {
    const visits = tempStore();
    expect(() => visits.record("short")).toThrow(VisitError);
    expect(() => visits.record("../secret")).toThrow(VisitError);
  });

  it("drops days beyond the retention window", () => {
    let now = new Date("2026-11-01T00:00:00Z");
    const visits = tempStore(() => now, 2);
    visits.record("browser-aaaa");
    now = new Date("2026-11-02T00:00:00Z");
    visits.record("browser-bbbb");
    now = new Date("2026-11-03T00:00:00Z");
    visits.record("browser-cccc");
    expect(visits.report().days.map((d) => d.day)).toEqual(["2026-11-03", "2026-11-02"]);
  });

  it("includes today at zero before anyone arrives", () => {
    expect(tempStore().report().days).toEqual([{ day: "2026-11-13", uniques: 0 }]);
  });

  it("ignores a corrupt file and records a new day", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-visits-")), "visits.json");
    fs.writeFileSync(file, "{not json");
    const visits = new VisitStore(file, () => new Date("2026-11-13T12:00:00Z"));
    expect(visits.record("browser-aaaa").uniques).toBe(1);
  });
});
