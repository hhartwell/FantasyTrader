import { EspnClient, type EspnAuth, type EspnRosterExtra } from "./espn.js";
import { loadPlayers } from "./players.js";
import {
  detectValuesParams,
  type SleeperClient,
  type SleeperLeague,
  type SleeperLeagueUser,
  type SleeperRoster,
} from "./sleeper.js";
import type { ValuesProvider, ValuesResult } from "./values/provider.js";
import { TEP_LEVELS, type ValuesParams } from "./values/snapshotFiles.js";
import { missingValuesMessage, type ValueSourceId } from "./values/valueSource.js";

export interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number;
  /** Taxi or IR. Omitted for players who count against the active roster. */
  held?: "taxi" | "reserve";
}

export interface LeagueTeam {
  rosterId: number;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  avatar: string | null;
  totalValue: number;
  players: RosterPlayer[];
}

export interface LeagueBundle {
  league: SleeperLeague;
  detected: ValuesParams;
  values: ValuesResult;
  teams: LeagueTeam[];
}

export class NoValuesError extends Error {}

export function mergeOverrides(detected: ValuesParams, raw: Record<string, unknown>): ValuesParams {
  const out = { ...detected };
  if (raw.isDynasty === "true" || raw.isDynasty === true) out.isDynasty = true;
  if (raw.isDynasty === "false" || raw.isDynasty === false) out.isDynasty = false;
  if (Number(raw.numQbs) === 1 || Number(raw.numQbs) === 2) out.numQbs = Number(raw.numQbs) as 1 | 2;
  if (raw.numTeams !== undefined && Number(raw.numTeams) > 0) out.numTeams = Number(raw.numTeams);
  if ([0, 0.5, 1].includes(Number(raw.ppr)) && raw.ppr !== undefined && raw.ppr !== "") {
    out.ppr = Number(raw.ppr) as ValuesParams["ppr"];
  }
  if (typeof raw.tep === "string" && (TEP_LEVELS as readonly string[]).includes(raw.tep)) {
    out.tep = raw.tep as ValuesParams["tep"];
  }
  return out;
}

/** Skill players still keyed by an ESPN id have no trade value until the players pull can match them. */
export function unmatchedPlayerWarning(teams: LeagueTeam[]): string | null {
  const count = teams
    .flatMap((team) => team.players)
    .filter((player) => player.id.startsWith("espn:") && ["QB", "RB", "WR", "TE"].includes(player.position)).length;
  if (count === 0) return null;
  const noun = count === 1 ? "player" : "players";
  return `${count} ${noun} did not match the local player list, so their trade value is 0. Run npm run data:pull-players and reload.`;
}

function assembleLeague(
  league: SleeperLeague,
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  extras: Map<number, EspnRosterExtra>,
  provider: ValuesProvider,
  overrides: Record<string, unknown>,
  source: ValueSourceId,
): LeagueBundle {
  const detected = detectValuesParams(league);
  const values = provider.getValues(mergeOverrides(detected, overrides));
  if (!values) throw new NoValuesError(missingValuesMessage(source));
  const playersDb = loadPlayers()?.players ?? {};
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const teams: LeagueTeam[] = rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const extra = extras.get(r.roster_id);
    const taxi = new Set(r.taxi ?? []);
    const reserve = new Set(r.reserve ?? []);
    const players: RosterPlayer[] = (r.players ?? []).map((id) => {
      const v = values.values.get(id);
      const db = playersDb[id];
      const label = extra?.labels[id];
      const held = taxi.has(id) ? ("taxi" as const) : reserve.has(id) ? ("reserve" as const) : undefined;
      return {
        id,
        name: v?.name ?? db?.name ?? label?.name ?? id,
        position: v?.position ?? db?.position ?? label?.position ?? "?",
        team: v?.team ?? db?.team ?? label?.team ?? null,
        age: v?.age ?? db?.age ?? null,
        value: v?.value ?? 0,
        ...(held ? { held } : {}),
      };
    });
    players.sort((a, b) => b.value - a.value);
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName: owner?.display_name ?? "Unowned",
      teamName: extra?.teamName || owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      avatar: extra ? extra.avatar : (owner?.avatar ?? null),
      totalValue: players.reduce((s, p) => s + p.value, 0),
      players,
    };
  });

  return { league, detected, values, teams };
}

/** Loads league, rosters, and owners from Sleeper and attaches values by sleeperId. */
export async function loadLeagueBundle(
  sleeper: SleeperClient,
  provider: ValuesProvider,
  leagueId: string,
  overrides: Record<string, unknown> = {},
  source: ValueSourceId = "fantasycalc",
): Promise<LeagueBundle> {
  const [league, rosters, users] = await Promise.all([
    sleeper.getLeague(leagueId),
    sleeper.getRosters(leagueId),
    sleeper.getLeagueUsers(leagueId),
  ]);
  return assembleLeague(league, rosters, users, new Map(), provider, overrides, source);
}

/** Loads one ESPN league and attaches values by the matched Sleeper player id. */
export async function loadEspnLeagueBundle(
  espn: EspnClient,
  provider: ValuesProvider,
  leagueId: string,
  season: string | undefined,
  auth: EspnAuth | undefined,
  overrides: Record<string, unknown> = {},
  source: ValueSourceId = "fantasycalc",
): Promise<LeagueBundle> {
  const loaded = await espn.getLeague(leagueId, season, auth);
  return assembleLeague(loaded.league, loaded.rosters, loaded.users, loaded.extras, provider, overrides, source);
}

export function valuesMeta(v: ValuesResult) {
  return {
    requested: v.requested,
    used: v.used,
    exact: v.exact,
    fetchedAt: v.fetchedAt,
    source: v.source,
    ...(v.basis ? { basis: v.basis } : {}),
  };
}
