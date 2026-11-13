/**
 * Manual FantasyCalc values pull. This is the ONLY code that talks to FantasyCalc;
 * the server reads the resulting snapshots from disk and never calls FantasyCalc.
 *
 *   npm run data:pull-values                       # full matrix (36 combos)
 *   npm run data:pull-values -- --dynasty=true --qbs=2 --teams=12 --ppr=1
 *   npm run data:pull-values -- --delay-ms=8000
 *
 * Any flag narrows the matrix. Combos pulled less than 3 hours ago are skipped.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { VALUES_DIR } from "../src/config.js";
import {
  PULL_MATRIX,
  isWithinGuard,
  snapshotFileName,
  type FantasyCalcEntry,
  type ValuesParams,
  type ValuesSnapshot,
} from "../src/values/snapshotFiles.js";

function fantasyCalcUrl(p: ValuesParams): string {
  const q = new URLSearchParams({
    isDynasty: String(p.isDynasty),
    numQbs: String(p.numQbs),
    numTeams: String(p.numTeams),
    ppr: String(p.ppr),
  });
  return `https://api.fantasycalc.com/values/current?${q}`;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([\w-]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
    else if (arg.startsWith("--")) out[arg.slice(2)] = "true";
  }
  return out;
}

function selectCombos(args: Record<string, string>): ValuesParams[] {
  return PULL_MATRIX.filter(
    (p) =>
      (args.dynasty === undefined || String(p.isDynasty) === args.dynasty) &&
      (args.qbs === undefined || String(p.numQbs) === args.qbs) &&
      (args.teams === undefined || String(p.numTeams) === args.teams) &&
      (args.ppr === undefined || Number(args.ppr) === p.ppr),
  );
}

async function readFetchedAt(file: string): Promise<string | undefined> {
  try {
    const json = JSON.parse(await fs.readFile(file, "utf8")) as Partial<ValuesSnapshot>;
    return json.fetchedAt;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const delayMs = Number(args["delay-ms"] ?? 5000);
  const combos = selectCombos(args);
  if (combos.length === 0) {
    console.error("No combinations match those flags.");
    process.exit(1);
  }
  await fs.mkdir(VALUES_DIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of combos) {
    const file = path.join(VALUES_DIR, snapshotFileName(p));
    const prev = await readFetchedAt(file);
    if (isWithinGuard(prev)) {
      console.log(`skip  ${snapshotFileName(p)} (pulled ${prev}, < 3h ago)`);
      skipped++;
      continue;
    }
    if (fetched > 0) await sleep(delayMs);

    const url = fantasyCalcUrl(p);
    console.log(`fetch ${url}`);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const values = (await res.json()) as FantasyCalcEntry[];
      if (!Array.isArray(values)) throw new Error("unexpected response shape");
      const snapshot: ValuesSnapshot = {
        source: "fantasycalc",
        fetchedAt: new Date().toISOString(),
        params: p,
        values,
      };
      await fs.writeFile(file, JSON.stringify(snapshot));
      console.log(`wrote ${snapshotFileName(p)} (${values.length} players)`);
    } catch (err) {
      console.error(`fail  ${snapshotFileName(p)}: ${(err as Error).message}`);
      failed++;
    }
    fetched++;
  }
  console.log(`done: ${fetched - failed} fetched, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main();
