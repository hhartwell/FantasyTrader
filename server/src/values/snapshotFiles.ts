export type Ppr = 0 | 0.5 | 1;

/** FantasyCalc TE premium tiers. `te+` is a moderate premium; `te++` is heavy. */
export type Tep = "none" | "te+" | "te++";

export const TEP_LEVELS: readonly Tep[] = ["none", "te+", "te++"];

export interface ValuesParams {
  isDynasty: boolean;
  numQbs: 1 | 2;
  numTeams: number;
  ppr: Ppr;
  /** Tight end premium board. `none` keeps the standard snapshot file name. */
  tep: Tep;
}

/** Raw entry shape returned by FantasyCalc's GET /values/current (fields we use). */
export interface FantasyCalcEntry {
  player: {
    id: number;
    name: string;
    sleeperId?: string | null;
    position: string;
    maybeTeam?: string | null;
    maybeAge?: number | null;
  };
  value: number;
  redraftValue?: number;
  overallRank?: number;
  positionRank?: number;
  trend30Day?: number;
}

export interface ValuesSnapshot {
  source: "fantasycalc";
  fetchedAt: string;
  params: ValuesParams;
  values: FantasyCalcEntry[];
}

export const MIN_REFETCH_MS = 3 * 60 * 60 * 1000;

export const PULL_MATRIX: ValuesParams[] = (() => {
  const out: ValuesParams[] = [];
  for (const isDynasty of [true, false])
    for (const numQbs of [1, 2] as const)
      for (const numTeams of [10, 12, 14])
        for (const ppr of [0, 0.5, 1] as const) out.push({ isDynasty, numQbs, numTeams, ppr, tep: "none" });
  return out;
})();

const TEP_FILE_SUFFIX: Record<Tep, string> = { none: "", "te+": "-teplus", "te++": "-teplusplus" };
const TEP_FROM_FILE: Record<string, Tep> = { teplus: "te+", teplusplus: "te++" };

export function snapshotFileName(p: ValuesParams): string {
  return `${p.isDynasty}-${p.numQbs}qb-${p.numTeams}t-${p.ppr}ppr${TEP_FILE_SUFFIX[p.tep]}.json`;
}

export function parseSnapshotFileName(name: string): ValuesParams | null {
  const m = /^(true|false)-([12])qb-(\d+)t-(0|0\.5|1)ppr(?:-(teplusplus|teplus))?\.json$/.exec(name);
  if (!m) return null;
  return {
    isDynasty: m[1] === "true",
    numQbs: Number(m[2]) as 1 | 2,
    numTeams: Number(m[3]),
    ppr: Number(m[4]) as Ppr,
    tep: m[5] ? TEP_FROM_FILE[m[5]] : "none",
  };
}

/** True when a snapshot fetched at `fetchedAt` is still inside the 3-hour no-refetch window. */
export function isWithinGuard(fetchedAt: string | undefined, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  const t = Date.parse(fetchedAt);
  return Number.isFinite(t) && now - t < MIN_REFETCH_MS;
}