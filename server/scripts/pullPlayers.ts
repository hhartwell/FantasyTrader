/**
 * Manual Sleeper players DB pull (~5 MB). Sleeper asks that /players/nfl be called
 * at most once per day, so this refuses to refetch within 24 hours.
 *
 *   npm run data:pull-players
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PLAYERS_FILE } from "../src/config.js";
import type { PlayersFile, SleeperPlayer } from "../src/players.js";

const MIN_REFETCH_MS = 24 * 60 * 60 * 1000;

async function main() {
  try {
    const prev = JSON.parse(await fs.readFile(PLAYERS_FILE, "utf8")) as PlayersFile;
    const age = Date.now() - Date.parse(prev.fetchedAt);
    if (age < MIN_REFETCH_MS) {
      console.log(`skip: players pulled ${prev.fetchedAt} (< 24h ago)`);
      return;
    }
  } catch {
    // no previous file
  }

  console.log("fetch https://api.sleeper.app/v1/players/nfl");
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = (await res.json()) as Record<string, Record<string, unknown>>;

  const players: Record<string, SleeperPlayer> = {};
  for (const [id, p] of Object.entries(raw)) {
    players[id] = {
      id,
      name: (p.full_name as string) ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      position: (p.position as string) ?? null,
      team: (p.team as string) ?? null,
      age: (p.age as number) ?? null,
    };
  }
  await fs.mkdir(path.dirname(PLAYERS_FILE), { recursive: true });
  const out: PlayersFile = { fetchedAt: new Date().toISOString(), players };
  await fs.writeFile(PLAYERS_FILE, JSON.stringify(out));
  console.log(`wrote ${PLAYERS_FILE} (${Object.keys(players).length} players)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
