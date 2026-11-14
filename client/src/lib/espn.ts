/** January and February are still the previous NFL season. */
export function defaultEspnSeason(now = new Date()): string {
  const year = now.getFullYear();
  return String(now.getMonth() < 2 ? year - 1 : year);
}

/** `{UUID}` form, matching the owner ids the API returns. */
export function canonicalSwid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const bare = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!/^[0-9A-Fa-f-]{8,}$/.test(bare)) return null;
  return `{${bare.toUpperCase()}}`;
}

/** Accepts a bare league id or an ESPN league URL. A seasonId in the URL wins over the season field. */
export function parseEspnLookup(
  leagueRaw: string,
  seasonRaw: string,
  now = new Date(),
): { leagueId: string; season: string } {
  const trimmed = leagueRaw.trim();
  const fromUrl = trimmed.match(/[?&]leagueId=(\d{1,12})(?!\d)/i)?.[1];
  const leagueId = fromUrl ?? (/^\d{1,12}$/.test(trimmed) ? trimmed : "");
  if (!leagueId) throw new Error("Enter the ESPN league id, or paste the league URL.");
  const seasonInUrl = trimmed.match(/[?&]seasonId=(\d{4})(?!\d)/i)?.[1];
  const season = seasonInUrl || seasonRaw.trim() || defaultEspnSeason(now);
  if (!/^\d{4}$/.test(season)) throw new Error("Season must be a four-digit year.");
  return { leagueId, season };
}
