import fs from "node:fs";
import type { PlayerValue, SnapshotStatus, ValuesProvider, ValuesResult, ValuesSource } from "./provider.js";
import { sleeperAdpFor, sleeperBasis, valueFromRank, YAHOO_BASIS, type SleeperAdp } from "./rankValue.js";
import type { ValuesParams } from "./snapshotFiles.js";

export interface RankingPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  adp?: SleeperAdp;
  /** Yahoo overall rank. 1 is best. */
  overall?: number;
}

export interface RankingSnapshot {
  source: "sleeper" | "yahoo";
  fetchedAt: string;
  season: string;
  players: RankingPlayer[];
}

/** Reads a Sleeper ADP or Yahoo overall-rank snapshot written by scripts/pullRankings.ts. */
export class RankingSnapshotProvider implements ValuesProvider {
  private cache: { mtimeMs: number; snapshot: RankingSnapshot } | null = null;

  constructor(
    private file: string,
    readonly source: ValuesSource,
    private kind: "sleeper" | "yahoo",
  ) {}

  private load(): RankingSnapshot | null {
    let mtimeMs: number;
    try {
      mtimeMs = fs.statSync(this.file).mtimeMs;
    } catch {
      return null;
    }
    if (this.cache?.mtimeMs === mtimeMs) return this.cache.snapshot;
    const snapshot = JSON.parse(fs.readFileSync(this.file, "utf8")) as RankingSnapshot;
    this.cache = { mtimeMs, snapshot };
    return snapshot;
  }

  summary(): { file: string; fetchedAt: string; season: string; players: number } | null {
    const snapshot = this.load();
    if (!snapshot) return null;
    return { file: this.file, fetchedAt: snapshot.fetchedAt, season: snapshot.season, players: snapshot.players.length };
  }

  getValues(requested: ValuesParams): ValuesResult | null {
    const snapshot = this.load();
    if (!snapshot || snapshot.source !== this.kind) return null;
    const values = new Map<string, PlayerValue>();
    for (const player of snapshot.players) {
      const rank = this.kind === "sleeper" ? (player.adp ? sleeperAdpFor(player.adp, requested) : null) : player.overall;
      if (rank == null || rank <= 0) continue;
      values.set(player.sleeperId, {
        sleeperId: player.sleeperId,
        name: player.name,
        position: player.position,
        team: player.team,
        age: null,
        value: valueFromRank(rank),
      });
    }
    if (values.size === 0) return null;
    const used = this.kind === "sleeper" ? { ...requested, tep: "none" as const } : requested;
    return {
      values,
      requested,
      used,
      exact: this.kind === "yahoo" || requested.tep === "none",
      fetchedAt: snapshot.fetchedAt,
      source: this.source,
      basis: this.kind === "sleeper" ? sleeperBasis(requested) : YAHOO_BASIS,
    };
  }

  status(): SnapshotStatus[] {
    return [];
  }
}
