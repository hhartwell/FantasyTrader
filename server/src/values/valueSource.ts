import { fantasyCalcEnabled } from "../config.js";

export type ValueSourceId = "fantasycalc" | "sleeper" | "yahoo";

export function parseValueSource(raw: unknown, allowFantasyCalc = fantasyCalcEnabled): ValueSourceId {
  if (raw === "sleeper" || raw === "yahoo") return raw;
  if (raw === "fantasycalc" && allowFantasyCalc) return "fantasycalc";
  return allowFantasyCalc ? "fantasycalc" : "sleeper";
}

export function missingValuesMessage(source: ValueSourceId): string {
  if (source === "sleeper") return "No Sleeper rankings snapshot. Run `npm run data:pull-rankings -- --source=sleeper`.";
  if (source === "yahoo") return "No Yahoo rankings snapshot. Run `npm run data:pull-rankings -- --source=yahoo`.";
  return "No value snapshots found. Run `npm run data:pull-values` first.";
}
