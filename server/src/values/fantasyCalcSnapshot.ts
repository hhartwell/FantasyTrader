import fs from "node:fs";
import path from "node:path";
import type { PlayerValue, SnapshotStatus, ValuesProvider, ValuesResult, ValuesSource } from "./provider.js";
import { parseSnapshotFileName, type Tep, type ValuesParams, type ValuesSnapshot } from "./snapshotFiles.js";

const TEP_RANK: Record<Tep, number> = { none: 0, "te+": 1, "te++": 2 };

/**
 * Lower is closer. League type and QB format dominate, then TE premium, then
 * team count and PPR.
 */
export function paramsDistance(a: ValuesParams, b: ValuesParams): number {
  return (
    (a.isDynasty === b.isDynasty ? 0 : 1000) +
    (a.numQbs === b.numQbs ? 0 : 100) +
    Math.abs(TEP_RANK[a.tep] - TEP_RANK[b.tep]) * 40 +
    Math.abs(a.numTeams - b.numTeams) * 2 +
    Math.abs(a.ppr - b.ppr) * 6
  );
}

export function pickNearest(requested: ValuesParams, available: ValuesParams[]): ValuesParams | null {
  let best: ValuesParams | null = null;
  let bestD = Infinity;
  for (const p of available) {
    const d = paramsDistance(requested, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

export function sameParams(a: ValuesParams, b: ValuesParams): boolean {
  return paramsDistance(a, b) === 0;
}

/** Reads FantasyCalc snapshots written by scripts/pullValues.ts. Never touches the network. */
export class FantasyCalcSnapshotProvider implements ValuesProvider {
  readonly source: ValuesSource = { name: "FantasyCalc", url: "https://fantasycalc.com" };
  private cache = new Map<string, { mtimeMs: number; snapshot: ValuesSnapshot; values: Map<string, PlayerValue> }>();

  constructor(private dir: string) {}

  private listFiles(): { file: string; params: ValuesParams }[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    return names.flatMap((file) => {
      const params = parseSnapshotFileName(file);
      return params ? [{ file, params }] : [];
    });
  }

  private load(file: string) {
    const full = path.join(this.dir, file);
    const { mtimeMs } = fs.statSync(full);
    const hit = this.cache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit;
    const snapshot = JSON.parse(fs.readFileSync(full, "utf8")) as ValuesSnapshot;
    const values = new Map<string, PlayerValue>();
    for (const e of snapshot.values) {
      const id = e.player.sleeperId;
      if (!id || e.player.position === "PICK") continue;
      values.set(id, {
        sleeperId: id,
        name: e.player.name,
        position: e.player.position,
        team: e.player.maybeTeam ?? null,
        age: e.player.maybeAge ?? null,
        value: e.value,
        positionRank: e.positionRank,
        trend30Day: e.trend30Day,
      });
    }
    const entry = { mtimeMs, snapshot, values };
    this.cache.set(file, entry);
    return entry;
  }

  getValues(requested: ValuesParams): ValuesResult | null {
    const files = this.listFiles();
    const used = pickNearest(
      requested,
      files.map((f) => f.params),
    );
    if (!used) return null;
    const file = files.find((f) => sameParams(f.params, used))!.file;
    const { snapshot, values } = this.load(file);
    return {
      values,
      requested,
      used,
      exact: sameParams(requested, used),
      fetchedAt: snapshot.fetchedAt,
      source: this.source,
    };
  }

  status(): SnapshotStatus[] {
    const now = Date.now();
    return this.listFiles().map(({ file, params }) => {
      const { snapshot, values } = this.load(file);
      return {
        file,
        params,
        fetchedAt: snapshot.fetchedAt,
        ageMinutes: Math.round((now - Date.parse(snapshot.fetchedAt)) / 60000),
        players: values.size,
      };
    });
  }
}
