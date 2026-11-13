import { loadPlayers } from "./players.js";
import { detectValuesParams, type SleeperClient, type SleeperLeague } from "./sleeper.js";
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
  const detected = detectValuesParams(league);
  const values = provider.getValues(mergeOverrides(detected, overrides));
  if (!values) throw new NoValuesError(missingValuesMessage(source));
  const playersDb = loadPlayers()?.players ?? {};
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const teams: LeagueTeam[] = rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const players: RosterPlayer[] = (r.players ?? []).map((id) => {
      const v = values.values.get(id);
      const db = playersDb[id];
      return {
        id,
        name: v?.name ?? db?.name ?? id,
        position: v?.position ?? db?.position ?? "?",
        team: v?.team ?? db?.team ?? null,
        age: v?.age ?? db?.age ?? null,
        value: v?.value ?? 0,
      };
    });
    players.sort((a, b) => b.value - a.value);
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      ownerName: owner?.display_name ?? "Unowned",
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
      avatar: owner?.avatar ?? null,
      totalValue: players.reduce((s, p) => s + p.value, 0),
      players,
    };
  });

  return { league, detected, values, teams };
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
