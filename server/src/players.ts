import fs from "node:fs";
import { PLAYERS_FILE } from "./config.js";

export interface SleeperPlayer {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  /** Yahoo player id, when the players pull stored it. */
  yahooId?: string | null;
}

export interface PlayersFile {
  fetchedAt: string;
  players: Record<string, SleeperPlayer>;
}

let cache: { mtimeMs: number; data: PlayersFile } | null = null;

/** Local Sleeper players DB written by scripts/pullPlayers.ts; empty if never pulled. */
export function loadPlayers(): PlayersFile | null {
  try {
    const { mtimeMs } = fs.statSync(PLAYERS_FILE);
    if (cache?.mtimeMs !== mtimeMs) {
      cache = { mtimeMs, data: JSON.parse(fs.readFileSync(PLAYERS_FILE, "utf8")) };
    }
    return cache.data;
  } catch {
    return null;
  }
}
