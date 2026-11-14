/**
 * Hourly data-pull beat. This process writes snapshots; the API only reads them.
 *
 *   npm run data:schedule
 *
 * Players and rankings run every tick. Their own scripts skip a refetch that is
 * still inside the source window (24 hours for Sleeper players, 6 hours for
 * rankings). FantasyCalc runs only when FANTASYCALC_ENABLED=true, and that
 * script still skips any combo pulled less than 3 hours ago.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");

/** How often the beat wakes. Source guards decide whether a refetch is allowed. */
export const BEAT_INTERVAL_MS = 60 * 60 * 1000;

export interface PullJob {
  id: "players" | "rankings" | "values";
  npmArgs: string[];
}

/** Players, then rankings, then FantasyCalc values when that source is enabled. */
export function pullJobs(includeFantasyCalc: boolean): PullJob[] {
  const jobs: PullJob[] = [
    { id: "players", npmArgs: ["run", "data:pull-players"] },
    { id: "rankings", npmArgs: ["run", "data:pull-rankings"] },
  ];
  if (includeFantasyCalc) {
    jobs.push({
      id: "values",
      npmArgs: ["run", "data:pull-values", "--", "--tep=all", "--delay-ms=5000"],
    });
  }
  return jobs;
}

/** One tick at a time. A second start is refused until the first tick finishes. */
export class BeatLock {
  private running = false;

  tryAcquire(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  release(): void {
    this.running = false;
  }
}

function runJob(job: PullJob): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npm", job.npmArgs, { cwd: serverDir, stdio: "inherit" });
    child.on("error", (err) => {
      console.error(`fail: ${job.id}: ${err.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`fail: ${job.id} signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

export async function runBeat(includeFantasyCalc: boolean, lock: BeatLock): Promise<void> {
  if (!lock.tryAcquire()) {
    console.log("skip: previous pull beat still running");
    return;
  }
  try {
    if (!includeFantasyCalc) console.log("skip: FantasyCalc values (FANTASYCALC_ENABLED is not true)");
    for (const job of pullJobs(includeFantasyCalc)) {
      console.log(`beat: ${job.id}`);
      const code = await runJob(job);
      if (code !== 0) console.error(`fail: ${job.id} exited ${code}`);
    }
  } finally {
    lock.release();
  }
}

async function main() {
  const { fantasyCalcEnabled } = await import("../src/config.js");
  const lock = new BeatLock();
  console.log("pull beat: every hour");
  await runBeat(fantasyCalcEnabled, lock);
  setInterval(() => {
    void runBeat(fantasyCalcEnabled, lock);
  }, BEAT_INTERVAL_MS);
}

const isMain = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
