import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from "./sleeper.js";
import { matchSleeperPlayer, type RankablePlayer } from "./values/rankValue.js";

const BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** ESPN receptions stat. Points on this item are the league's PPR value. */
const REC_STAT = 53;
/** ESPN default position id for tight end. Reception overrides live under this key. */
const TE_POSITION = 4;
const IR_SLOT = 21;

/**
 * ESPN lineup slot id → roster slot name used by the trade engine.
 * Bench and IR are included so the active roster size stays accurate.
 */
const LINEUP_SLOTS: { id: string; slot: string }[] = [
  { id: "0", slot: "QB" },
  { id: "2", slot: "RB" },
  { id: "3", slot: "WRRB_FLEX" },
  { id: "4", slot: "WR" },
  { id: "5", slot: "REC_FLEX" },
  { id: "6", slot: "TE" },
  { id: "7", slot: "SUPER_FLEX" },
  { id: "16", slot: "DEF" },
  { id: "17", slot: "K" },
  { id: "23", slot: "FLEX" },
  { id: "20", slot: "BN" },
  { id: "21", slot: "IR" },
];

const KNOWN_SLOTS = new Set(LINEUP_SLOTS.map((slot) => slot.id));

const ESPN_POSITIONS: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DEF",
};

export class EspnError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface EspnAuth {
  espnS2?: string;
  swid?: string;
}

export interface EspnPlayerLabel {
  name: string;
  position: string;
  team: string | null;
}

export interface EspnRosterExtra {
  teamName: string;
  avatar: string | null;
  labels: Record<string, EspnPlayerLabel>;
}

export interface EspnLoadedLeague {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  extras: Map<number, EspnRosterExtra>;
}

interface ScoringItem {
  statId?: number;
  points?: number;
  pointsOverrides?: Record<string, number>;
}

interface EspnPlayer {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  defaultPositionId?: number;
}

interface EspnEntry {
  playerId?: number;
  lineupSlotId?: number;
  playerPoolEntry?: { player?: EspnPlayer };
}

interface EspnTeam {
  id?: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  logo?: string;
  primaryOwner?: string;
  roster?: { entries?: EspnEntry[] };
}

interface EspnMember {
  id?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

interface EspnLeagueJson {
  id?: number;
  seasonId?: number;
  status?: { isActive?: boolean };
  settings?: {
    name?: string;
    size?: number;
    draftSettings?: { keeperCount?: number };
    rosterSettings?: { lineupSlotCounts?: Record<string, number> };
    scoringSettings?: { scoringItems?: ScoringItem[] };
  };
  members?: EspnMember[];
  teams?: EspnTeam[];
  messages?: unknown;
}

export type EspnFetchResult = { status: number; body: unknown };
export type EspnFetcher = (url: string, headers: Record<string, string>) => Promise<EspnFetchResult>;

const defaultFetcher: EspnFetcher = async (url, headers) => {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }
  return { status: res.ok && body && typeof body === "object" ? res.status : res.ok ? 502 : res.status, body };
};

/** January and February are still the previous NFL season. */
export function defaultEspnSeason(now = new Date()): string {
  const year = now.getUTCFullYear();
  return String(now.getUTCMonth() < 2 ? year - 1 : year);
}

/** `{uuid}` form ESPN uses on team owners. Returns null when the value is not a SWID. */
export function canonicalSwid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bare = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!/^[0-9A-Fa-f-]{8,}$/.test(bare)) return null;
  return `{${bare.toUpperCase()}}`;
}

export function parseEspnLeagueId(raw: string): string {
  const id = raw.trim();
  if (!/^\d{1,12}$/.test(id)) throw new EspnError("Enter the ESPN league id from the league URL.", 400);
  return id;
}

export function parseEspnSeason(raw: string | undefined, now = new Date()): string {
  if (raw == null || raw.trim() === "") return defaultEspnSeason(now);
  const season = raw.trim();
  if (!/^\d{4}$/.test(season)) throw new EspnError("Season must be a four-digit year.", 400);
  return season;
}

function cookieValue(value: string | undefined, label: string): string | undefined {
  if (value == null || value.trim() === "") return undefined;
  const trimmed = value.trim();
  if (/[\r\n;]/.test(trimmed)) {
    throw new EspnError(`${label} cannot contain a semicolon or a line break.`, 400);
  }
  return trimmed;
}

/** Cookie header sent to ESPN. Values are copied through unchanged so an already-encoded espn_s2 still matches. */
export function espnCookieHeader(auth: EspnAuth | undefined): string | undefined {
  if (!auth) return undefined;
  const parts: string[] = [];
  const s2 = cookieValue(auth.espnS2, "espn_s2");
  const swid = cookieValue(auth.swid, "SWID");
  if (s2) parts.push(`espn_s2=${s2}`);
  if (swid) {
    const canonical = canonicalSwid(swid);
    if (!canonical) throw new EspnError("SWID should look like {12345678-ABCD-...}.", 400);
    parts.push(`SWID=${canonical}`);
  }
  return parts.length ? parts.join("; ") : undefined;
}

function hashCookie(cookie: string): string {
  let hash = 5381;
  for (let i = 0; i < cookie.length; i++) hash = ((hash << 5) + hash) ^ cookie.charCodeAt(i);
  return (hash >>> 0).toString(16);
}

function receptionScoring(items: ScoringItem[]): { rec: number; teBonus: number } {
  const recItem = items.find((item) => item.statId === REC_STAT);
  const rec = typeof recItem?.points === "number" ? recItem.points : 0;
  const override = recItem?.pointsOverrides?.[String(TE_POSITION)];
  const teBonus = typeof override === "number" && override > rec ? override - rec : 0;
  return { rec, teBonus };
}

export function espnRosterPositions(counts: Record<string, number> | undefined): string[] {
  const slots: string[] = [];
  const used = new Set<string>();
  for (const { id, slot } of LINEUP_SLOTS) {
    const count = counts?.[id] ?? 0;
    if (!(count > 0)) continue;
    used.add(id);
    for (let i = 0; i < count; i++) slots.push(slot);
  }
  const rest = Object.keys(counts ?? {}).sort((a, b) => Number(a) - Number(b));
  for (const id of rest) {
    if (used.has(id) || KNOWN_SLOTS.has(id)) continue;
    const count = counts?.[id] ?? 0;
    if (!(count > 0)) continue;
    for (let i = 0; i < count; i++) slots.push("BN");
  }
  return slots;
}

function teamName(team: EspnTeam): string {
  const combined = [team.location, team.nickname]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" ")
    .trim();
  if (combined) return combined;
  if (typeof team.name === "string" && team.name.trim()) return team.name.trim();
  if (typeof team.abbrev === "string" && team.abbrev.trim()) return team.abbrev.trim();
  return `Team ${team.id ?? ""}`.trim();
}

function playerName(player: EspnPlayer | undefined, playerId: number): string {
  if (typeof player?.fullName === "string" && player.fullName.trim()) return player.fullName.trim();
  const combined = [player?.firstName, player?.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" ")
    .trim();
  return combined || `ESPN ${playerId}`;
}

function memberName(member: EspnMember): string {
  if (typeof member.displayName === "string" && member.displayName.trim()) return member.displayName.trim();
  const combined = [member.firstName, member.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" ")
    .trim();
  return combined || "Manager";
}

function asLeague(body: unknown): EspnLeagueJson {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new EspnError("ESPN returned an unexpected league response.");
  }
  const league = body as EspnLeagueJson;
  if (typeof league.id !== "number") {
    const message = Array.isArray(league.messages) ? league.messages.find((item) => typeof item === "string") : undefined;
    throw new EspnError(typeof message === "string" ? message : "ESPN returned an unexpected league response.");
  }
  return league;
}

/** Maps an ESPN league payload onto the Sleeper league, roster, and owner shape the trade engine already uses. */
export function readEspnLeague(body: unknown, players: RankablePlayer[] = []): EspnLoadedLeague {
  const raw = asLeague(body);
  const settings = raw.settings ?? {};
  const scoring = receptionScoring(settings.scoringSettings?.scoringItems ?? []);
  const keeperCount = Number(settings.draftSettings?.keeperCount ?? 0);
  const teams = raw.teams ?? [];
  const league: SleeperLeague = {
    league_id: String(raw.id),
    name: settings.name?.trim() || `ESPN ${raw.id}`,
    season: String(raw.seasonId ?? ""),
    status: raw.status?.isActive === false ? "complete" : "in_season",
    avatar: null,
    total_rosters: settings.size && settings.size > 0 ? settings.size : teams.length,
    roster_positions: espnRosterPositions(settings.rosterSettings?.lineupSlotCounts),
    scoring_settings: {
      rec: scoring.rec,
      ...(scoring.teBonus > 0 ? { bonus_rec_te: scoring.teBonus } : {}),
    },
    settings: { type: keeperCount > 0 ? 1 : 0 },
  };

  const members = new Map<string, string>();
  for (const member of raw.members ?? []) {
    const id = canonicalSwid(member.id);
    if (id) members.set(id, memberName(member));
  }

  const rosters: SleeperRoster[] = [];
  const users: SleeperLeagueUser[] = [];
  const extras = new Map<number, EspnRosterExtra>();

  teams.forEach((team, index) => {
    const rosterId = typeof team.id === "number" ? team.id : index + 1;
    const ownerId = canonicalSwid(team.primaryOwner);
    const labels: Record<string, EspnPlayerLabel> = {};
    const playerIds: string[] = [];
    const reserve: string[] = [];
    const seen = new Set<string>();

    for (const entry of team.roster?.entries ?? []) {
      if (typeof entry.playerId !== "number") continue;
      const espnPlayer = entry.playerPoolEntry?.player;
      const position = ESPN_POSITIONS[espnPlayer?.defaultPositionId ?? -1] ?? "?";
      const name = playerName(espnPlayer, entry.playerId);
      const matched = matchSleeperPlayer(
        { espnId: String(entry.playerId), name, position },
        players,
      );
      const id = matched?.id ?? `espn:${entry.playerId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      playerIds.push(id);
      labels[id] = { name: matched?.name ?? name, position: matched?.position ?? position, team: matched?.team ?? null };
      if (entry.lineupSlotId === IR_SLOT) reserve.push(id);
    }

    rosters.push({
      roster_id: rosterId,
      owner_id: ownerId,
      players: playerIds,
      starters: null,
      reserve,
      taxi: null,
    });
    if (ownerId) {
      users.push({
        user_id: ownerId,
        display_name: members.get(ownerId) ?? "Manager",
        avatar: null,
      });
    }
    const logo = typeof team.logo === "string" && /^https?:\/\//i.test(team.logo) ? team.logo : null;
    extras.set(rosterId, { teamName: teamName(team), avatar: logo, labels });
  });

  return { league, rosters, users, extras };
}

/** Reads one ESPN league. Public leagues need no cookies. Private leagues need espn_s2 and SWID. */
export class EspnClient {
  private cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(
    private fetcher: EspnFetcher = defaultFetcher,
    private ttlMs = DEFAULT_TTL_MS,
    private players: () => RankablePlayer[] = () => [],
  ) {}

  async getLeague(leagueId: string, season: string | undefined, auth?: EspnAuth): Promise<EspnLoadedLeague> {
    const id = parseEspnLeagueId(leagueId);
    const year = parseEspnSeason(season);
    const cookie = espnCookieHeader(auth);
    const url = `${BASE}/seasons/${year}/segments/0/leagues/${id}?view=mSettings&view=mTeam&view=mRoster`;
    const key = cookie ? `${url}#${hashCookie(cookie)}` : url;
    const now = Date.now();
    const hit = this.cache.get(key);
    const value =
      hit && hit.expires > now
        ? hit.value
        : this.fetcher(url, {
            Accept: "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          }).then((res) => {
            if (res.status === 401 || res.status === 403) {
              throw new EspnError(
                cookie
                  ? "ESPN rejected those cookies. Copy espn_s2 and SWID again from a signed-in fantasy.espn.com session."
                  : "This ESPN league is private. Add your espn_s2 and SWID cookies.",
                res.status,
              );
            }
            if (res.status === 404) throw new EspnError("ESPN league not found. Check the league id and season.", 404);
            if (res.status !== 200) {
              throw new EspnError(`ESPN ${res.status}`, res.status >= 400 && res.status < 600 ? res.status : 502);
            }
            return res.body;
          });
    if (!hit || hit.expires <= now) {
      this.cache.set(key, { expires: now + this.ttlMs, value });
      value.catch(() => this.cache.delete(key));
    }
    try {
      return readEspnLeague(await value, this.players());
    } catch (err) {
      this.cache.delete(key);
      throw err;
    }
  }
}
