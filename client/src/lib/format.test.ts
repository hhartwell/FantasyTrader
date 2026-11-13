import { describe, expect, it } from "vitest";
import { formatPct, formatValue, receiveShare, settingsLabel, timeAgo } from "./format";

describe("format helpers", () => {
  it("formats values and percentages", () => {
    expect(formatValue(10907.6)).toBe("10,908");
    expect(formatPct(0.0834)).toBe("8.3%");
    expect(formatPct(0.05, true)).toBe("+5%");
  });

  it("labels league settings", () => {
    expect(settingsLabel({ isDynasty: true, numQbs: 2, numTeams: 12, ppr: 0.5 })).toBe(
      "Dynasty · Superflex · 12 teams · Half PPR",
    );
  });

  it("computes the fairness bar share", () => {
    expect(receiveShare(100, 100)).toBe(0.5);
    expect(receiveShare(0, 0)).toBe(0.5);
    expect(receiveShare(300, 100)).toBe(0.75);
  });

  it("describes snapshot age", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(timeAgo("2026-01-01T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-01-01T09:00:00Z", now)).toBe("3h ago");
  });
});
