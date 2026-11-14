import type { ValuesParams } from "./snapshotFiles.js";

/** ADP at or above this is Sleeper's placeholder for an unranked player. */
export const UNRANKED_ADP = 500;

export interface SleeperAdp {
  ppr: number | null;
  half: number | null;
  std: number | null;
  sf: number | null;
  dynastyPpr: number | null;
  dynastyHalf: number | null;
  dynastyStd: number | null;
  dynastySf: number | null;
}

export interface RankablePlayer {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  yahooId?: string | null;
  espnId?: string | null;
}

/**
 * Turns a rank or ADP (1 = best) into a trade value on the same 1–10,000 scale
 * as FantasyCalc. Value is 10,000 / sqrt(rank): two mid-first players roughly
 * balance one earlier pick, and late ranks stay small.
 */
export function valueFromRank(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return Math.max(1, Math.round(10000 / Math.sqrt(rank)));
}

export function rankedAdp(adp: number | null): number | null {
  if (adp == null || !Number.isFinite(adp) || adp <= 0 || adp >= UNRANKED_ADP) return null;
  return adp;
}

/** ADP column that matches the league format. Superflex boards are not split by PPR. */
export function sleeperAdpFor(adp: SleeperAdp, params: ValuesParams): number | null {
  if (params.isDynasty) {
    if (params.numQbs === 2) return rankedAdp(adp.dynastySf);
    if (params.ppr === 0) return rankedAdp(adp.dynastyStd);
    if (params.ppr === 0.5) return rankedAdp(adp.dynastyHalf);
    return rankedAdp(adp.dynastyPpr);
  }
  if (params.numQbs === 2) return rankedAdp(adp.sf);
  if (params.ppr === 0) return rankedAdp(adp.std);
  if (params.ppr === 0.5) return rankedAdp(adp.half);
  return rankedAdp(adp.ppr);
}

export function sleeperBasis(params: ValuesParams): string {
  const format = params.isDynasty ? "Dynasty" : "Redraft";
  const qb = params.numQbs === 2 ? "Superflex" : "1QB";
  const ppr = params.ppr === 1 ? "PPR" : params.ppr === 0.5 ? "Half PPR" : "Standard";
  const scoring = params.numQbs === 2 ? "superflex ADP is not split by PPR" : ppr;
  return `Sleeper ADP converted to trade value · ${format} · ${qb} · ${scoring}. TE premium is not included.`;
}

export const YAHOO_BASIS = "Yahoo overall rank converted to trade value. One list for every format.";

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Prefer a Yahoo or ESPN id hit. Otherwise match name and position, and skip ambiguous names. */
export function matchSleeperPlayer(
  external: { yahooId?: string; espnId?: string; name: string; position: string },
  players: RankablePlayer[],
): RankablePlayer | null {
  if (external.yahooId) {
    const byYahoo = players.find((p) => p.yahooId && p.yahooId === external.yahooId);
    if (byYahoo) return byYahoo;
  }
  if (external.espnId) {
    const byEspn = players.find((p) => p.espnId && p.espnId === external.espnId);
    if (byEspn) return byEspn;
  }
  const key = normalizePlayerName(external.name);
  const hits = players.filter((p) => p.position === external.position && normalizePlayerName(p.name) === key);
  if (hits.length === 1) return hits[0];
  const withTeam = hits.filter((p) => p.team);
  return withTeam.length === 1 ? withTeam[0] : null;
}
