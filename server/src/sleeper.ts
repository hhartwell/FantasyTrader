import type { Ppr, Tep, ValuesParams } from "./values/snapshotFiles.js";

const BASE = "https://api.sleeper.app/v1";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  avatar: string | null;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string } | null;
}

export interface SleeperState {
  season: string;
  league_season: string;
  previous_season: string;
}

type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new SleeperError(`Sleeper ${res.status} for ${url}`, res.status);
  return res.json();
};

export class SleeperError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** Typed Sleeper client with a small in-memory TTL cache shared across requests. */
export class SleeperClient {
  private cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(
    private fetcher: Fetcher = defaultFetcher,
    private ttlMs = DEFAULT_TTL_MS,
  ) {}

  private get<T>(path: string): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(path);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = this.fetcher(`${BASE}${path}`);
    this.cache.set(path, { expires: now + this.ttlMs, value });
    value.catch(() => this.cache.delete(path));
    return value as Promise<T>;
  }

  getState() {
    return this.get<SleeperState>("/state/nfl");
  }
  async getUser(username: string) {
    const user = await this.get<SleeperUser | null>(`/user/${encodeURIComponent(username)}`);
    if (!user) throw new SleeperError(`Sleeper user "${username}" not found`, 404);
    return user;
  }
  getUserLeagues(userId: string, season: string) {
    return this.get<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`);
  }
  async getLeague(leagueId: string) {
    const league = await this.get<SleeperLeague | null>(`/league/${leagueId}`);
    if (!league) throw new SleeperError(`Sleeper league ${leagueId} not found`, 404);
    return league;
  }
  getRosters(leagueId: string) {
    return this.get<SleeperRoster[]>(`/league/${leagueId}/rosters`);
  }
  getLeagueUsers(leagueId: string) {
    return this.get<SleeperLeagueUser[]>(`/league/${leagueId}/users`);
  }
}

/**
 * Maps a TE reception bonus onto FantasyCalc's tiers.
 * Up to 1.0 extra point per catch is TE+; anything above that is TE++.
 */
export function tepFromBonus(bonus: number): Tep {
  if (!(bonus > 0)) return "none";
  return bonus <= 1 ? "te+" : "te++";
}

/** Extra points a TE earns per catch above the league's base reception scoring. */
export function teReceptionBonus(scoring: Record<string, number> | undefined): number {
  if (!scoring) return 0;
  const explicit = scoring.bonus_rec_te;
  if (typeof explicit === "number" && explicit > 0) return explicit;
  const rec = scoring.rec ?? 0;
  const recTe = scoring.rec_te;
  if (typeof recTe === "number" && recTe > rec) return recTe - rec;
  return 0;
}

/** Sleeper settings.type: 0 = redraft, 1 = keeper, 2 = dynasty (3 = guillotine etc. treated as redraft). */
export function detectValuesParams(league: SleeperLeague): ValuesParams {
  const type = league.settings?.type ?? 0;
  const positions = league.roster_positions ?? [];
  const qbSlots = positions.filter((p) => p === "QB").length;
  const superflex = positions.includes("SUPER_FLEX");
  const rec = league.scoring_settings?.rec ?? 0;
  const ppr: Ppr = rec >= 0.75 ? 1 : rec >= 0.25 ? 0.5 : 0;
  return {
    isDynasty: type === 1 || type === 2,
    numQbs: superflex || qbSlots >= 2 ? 2 : 1,
    numTeams: league.total_rosters,
    ppr,
    tep: tepFromBonus(teReceptionBonus(league.scoring_settings)),
  };
}
