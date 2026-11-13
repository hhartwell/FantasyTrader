import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Fill unset variables from the repo `.env`. Existing process env wins. */
function loadRootEnv() {
  let text: string;
  try {
    text = fs.readFileSync(path.resolve(here, "../../.env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

/** Off unless explicitly true, so a release does not show FantasyCalc values without permission. */
export const fantasyCalcEnabled = process.env.FANTASYCALC_ENABLED === "true";

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(here, "../../data");
export const VALUES_DIR = path.join(DATA_DIR, "values");
export const PLAYERS_FILE = path.join(DATA_DIR, "players", "nfl.json");
export const RANKINGS_DIR = path.join(DATA_DIR, "rankings");
export const SLEEPER_RANKINGS_FILE = path.join(RANKINGS_DIR, "sleeper-adp.json");
export const YAHOO_RANKINGS_FILE = path.join(RANKINGS_DIR, "yahoo-overall.json");
export const VISITS_FILE = path.join(DATA_DIR, "visits.json");
