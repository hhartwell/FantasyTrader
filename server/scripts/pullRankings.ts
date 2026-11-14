/**
 * Manual rankings pull. The server reads the snapshots and does not call these APIs.
 *
 *   npm run data:pull-rankings                  # Sleeper ADP and Yahoo overall rank
 *   npm run data:pull-rankings -- --source=sleeper
 *   npm run data:pull-rankings -- --source=yahoo
 *   npm run data:pull-rankings -- --force
 *
 * Sleeper ADP comes from the season projections feed (dynasty, superflex, and PPR).
 * Yahoo is the public overall rank (OR) for offensive players. Both are stored by
 * Sleeper player id. A file pulled less than 6 hours ago is skipped unless --force.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { RANKINGS_DIR, SLEEPER_RANKINGS_FILE, YAHOO_RANKINGS_FILE } from "../src/config.js";
import { loadPlayers } from "../src/players.js";
import type { RankingPlayer, RankingSnapshot } from "../src/values/rankingSnapshot.js";
import { matchSleeperPlayer, UNRANKED_ADP, type SleeperAdp } from "../src/values/rankValue.js";

const MIN_REFETCH_MS = 6 * 60 * 60 * 1000;
const YAHOO_PAGE = 25;
const YAHOO_MAX_RANK = 300;
/** Yahoo publishes no numeric Fantasy Sports limit and throttles short bursts. */
const YAHOO_PAGE_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([\w-]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
    else if (arg.startsWith("--")) out[arg.slice(2)] = "true";
  }
  return out;
}

async function readFetchedAt(file: string): Promise<string | undefined> {
  try {
    const json = JSON.parse(await fs.readFile(file, "utf8")) as Partial<RankingSnapshot>;
    return json.fetchedAt;
  } catch {
    return undefined;
  }
}

function fresh(fetchedAt: string | undefined, force: boolean): boolean {
  if (force || !fetchedAt) return false;
  const t = Date.parse(fetchedAt);
  return Number.isFinite(t) && Date.now() - t < MIN_REFETCH_MS;
}

function adpField(stats: Record<string, unknown>, key: string): number | null {
  const v = Number(stats[key]);
  if (!Number.isFinite(v) || v <= 0 || v >= UNRANKED_ADP) return null;
  return Math.round(v * 10) / 10;
}

async function pullSleeper(season: string): Promise<RankingSnapshot> {
  const url = `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE`;
  console.log(`fetch ${url}`);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Sleeper projections HTTP ${res.status}`);
  const rows = (await res.json()) as {
    player_id?: string;
    team?: string | null;
    player?: { first_name?: string; last_name?: string; position?: string; team?: string | null };
    stats?: Record<string, unknown>;
  }[];
  if (!Array.isArray(rows)) throw new Error("Sleeper projections returned an unexpected shape");

  const players: RankingPlayer[] = [];
  for (const row of rows) {
    const position = row.player?.position;
    if (!row.player_id || !position || !["QB", "RB", "WR", "TE"].includes(position)) continue;
    const stats = row.stats ?? {};
    const adp: SleeperAdp = {
      ppr: adpField(stats, "adp_ppr"),
      half: adpField(stats, "adp_half_ppr"),
      std: adpField(stats, "adp_std"),
      sf: adpField(stats, "adp_2qb"),
      dynastyPpr: adpField(stats, "adp_dynasty_ppr"),
      dynastyHalf: adpField(stats, "adp_dynasty_half_ppr"),
      dynastyStd: adpField(stats, "adp_dynasty_std"),
      dynastySf: adpField(stats, "adp_dynasty_2qb"),
    };
    if (Object.values(adp).every((n) => n == null)) continue;
    const name = `${row.player?.first_name ?? ""} ${row.player?.last_name ?? ""}`.trim();
    players.push({
      sleeperId: String(row.player_id),
      name: name || String(row.player_id),
      position,
      team: row.player?.team ?? row.team ?? null,
      adp,
    });
  }
  return { source: "sleeper", fetchedAt: new Date().toISOString(), season, players };
}

async function yahooGameKey(season: string): Promise<string> {
  const url = "https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/games;game_codes=nfl?format=json";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Yahoo games HTTP ${res.status}`);
  const data = (await res.json()) as { fantasy_content?: { games?: Record<string, unknown> } };
  const games = data.fantasy_content?.games ?? {};
  for (const [key, value] of Object.entries(games)) {
    if (key === "count" || !value || typeof value !== "object") continue;
    const game = (value as { game?: unknown }).game;
    const meta = Array.isArray(game) ? game[0] : game;
    if (meta && typeof meta === "object" && String((meta as { season?: unknown }).season) === season) {
      return String((meta as { game_key?: unknown }).game_key);
    }
  }
  throw new Error(`No Yahoo football game for ${season}`);
}

function readYahooPlayer(entry: unknown): { yahooId: string; name: string; position: string; rank: number } | null {
  if (!entry || typeof entry !== "object") return null;
  const player = (entry as { player?: unknown }).player;
  if (!Array.isArray(player) || !Array.isArray(player[0])) return null;
  const meta: Record<string, unknown> = {};
  for (const item of player[0]) {
    if (item && typeof item === "object") Object.assign(meta, item);
  }
  const extra = player[1] && typeof player[1] === "object" ? (player[1] as { player_ranks?: unknown }) : {};
  const ranks = Array.isArray(extra.player_ranks) ? extra.player_ranks : [];
  let rank: number | null = null;
  for (const row of ranks) {
    const pr = (row as { player_rank?: { rank_type?: string; rank_value?: string } }).player_rank;
    if (pr?.rank_type === "OR") rank = Number(pr.rank_value);
  }
  const nameObj = meta.name as { full?: string } | undefined;
  const name = nameObj?.full ?? "";
  const position = String(meta.display_position ?? meta.primary_position ?? "");
  const yahooId = meta.player_id == null ? "" : String(meta.player_id);
  if (!name || !["QB", "RB", "WR", "TE"].includes(position) || !yahooId || !rank || rank <= 0 || rank > YAHOO_MAX_RANK) {
    return null;
  }
  return { yahooId, name, position, rank };
}

async function pullYahoo(season: string): Promise<RankingSnapshot> {
  const gameKey = await yahooGameKey(season);
  const db = Object.values(loadPlayers()?.players ?? {});
  if (db.length === 0) console.log("warn: no local players file, so Yahoo names cannot be matched to Sleeper ids");
  const players: RankingPlayer[] = [];
  let unmatched = 0;
  for (let start = 0; start <= 450; start += YAHOO_PAGE) {
    if (start > 0) await sleep(YAHOO_PAGE_DELAY_MS);
    const url = `https://pub-api-ro.fantasysports.yahoo.com/fantasy/v2/game/${gameKey}/players;position=O;sort=OR;out=ranks;start=${start};count=${YAHOO_PAGE}?format=json`;
    console.log(`fetch Yahoo ranks start=${start}`);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Yahoo ranks HTTP ${res.status}`);
    const data = (await res.json()) as {
      fantasy_content?: { game?: [unknown, { players?: Record<string, unknown> }] };
    };
    const page = data.fantasy_content?.game?.[1]?.players ?? {};
    const count = Number(page.count ?? 0);
    if (!count) break;
    let pageMin = Infinity;
    for (let i = 0; i < count; i++) {
      const parsed = readYahooPlayer(page[String(i)]);
      if (!parsed) continue;
      pageMin = Math.min(pageMin, parsed.rank);
      const hit = matchSleeperPlayer(parsed, db);
      if (!hit) {
        unmatched++;
        continue;
      }
      players.push({
        sleeperId: hit.id,
        name: hit.name,
        position: hit.position ?? parsed.position,
        team: hit.team,
        overall: parsed.rank,
      });
    }
    if (pageMin > YAHOO_MAX_RANK) break;
  }
  console.log(`yahoo matched ${players.length}, unmatched ${unmatched}`);
  const byId = new Map<string, RankingPlayer>();
  for (const player of players) {
    const prev = byId.get(player.sleeperId);
    if (!prev || (player.overall ?? Infinity) < (prev.overall ?? Infinity)) byId.set(player.sleeperId, player);
  }
  return { source: "yahoo", fetchedAt: new Date().toISOString(), season, players: [...byId.values()] };
}

async function sleeperSeason(override: string | undefined): Promise<string> {
  if (override) return override;
  const res = await fetch("https://api.sleeper.app/v1/state/nfl");
  if (!res.ok) throw new Error(`Sleeper state HTTP ${res.status}`);
  const state = (await res.json()) as { season?: string };
  if (!state.season) throw new Error("Sleeper state did not include a season");
  return state.season;
}

async function writeSnapshot(file: string, snapshot: RankingSnapshot) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(snapshot));
  console.log(`wrote ${path.basename(file)} (${snapshot.players.length} players)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source ?? "all";
  if (!["all", "sleeper", "yahoo"].includes(source)) {
    console.error("Unknown --source. Use sleeper, yahoo, or all.");
    process.exit(1);
  }
  const force = args.force === "true";
  const season = await sleeperSeason(args.season);
  await fs.mkdir(RANKINGS_DIR, { recursive: true });

  if (source === "all" || source === "sleeper") {
    const prev = await readFetchedAt(SLEEPER_RANKINGS_FILE);
    if (fresh(prev, force)) console.log(`skip  sleeper-adp.json (pulled ${prev}, < 6h ago)`);
    else await writeSnapshot(SLEEPER_RANKINGS_FILE, await pullSleeper(season));
  }
  if (source === "all" || source === "yahoo") {
    const prev = await readFetchedAt(YAHOO_RANKINGS_FILE);
    if (fresh(prev, force)) console.log(`skip  yahoo-overall.json (pulled ${prev}, < 6h ago)`);
    else await writeSnapshot(YAHOO_RANKINGS_FILE, await pullYahoo(season));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
