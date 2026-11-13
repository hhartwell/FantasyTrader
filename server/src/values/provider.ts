import type { ValuesParams } from "./snapshotFiles.js";

export interface PlayerValue {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number;
  positionRank?: number;
  trend30Day?: number;
}

export interface ValuesSource {
  name: string;
  url: string;
}

export interface ValuesResult {
  values: Map<string, PlayerValue>;
  requested: ValuesParams;
  used: ValuesParams;
  /** False when no snapshot matched exactly and the nearest one was used. */
  exact: boolean;
  fetchedAt: string;
  source: ValuesSource;
}

export interface SnapshotStatus {
  file: string;
  params: ValuesParams;
  fetchedAt: string;
  ageMinutes: number;
  players: number;
}

/**
 * Source of player values. The app depends only on this interface so FantasyCalc
 * can be swapped for another source (our own rankings, a licensed feed) later.
 */
export interface ValuesProvider {
  readonly source: ValuesSource;
  /** Returns null when the provider has no data at all. */
  getValues(params: ValuesParams): ValuesResult | null;
  status(): SnapshotStatus[];
}
