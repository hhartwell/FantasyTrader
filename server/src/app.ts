import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { VALUES_DIR } from "./config.js";
import { loadLeagueBundle, NoValuesError, valuesMeta } from "./leagueData.js";
import { detectValuesParams, SleeperClient, SleeperError } from "./sleeper.js";
import { FantasyCalcSnapshotProvider } from "./values/fantasyCalcSnapshot.js";
import type { ValuesProvider } from "./values/provider.js";

export interface AppDeps {
  sleeper?: SleeperClient;
  provider?: ValuesProvider;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function createApp(deps: AppDeps = {}) {
  const sleeper = deps.sleeper ?? new SleeperClient();
  const provider = deps.provider ?? new FantasyCalcSnapshotProvider(VALUES_DIR);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/values/status", (_req, res) => {
    res.json({ source: provider.source, snapshots: provider.status() });
  });

  app.get(
    "/api/leagues",
    wrap(async (req, res) => {
      const username = String(req.query.username ?? "").trim();
      if (!username) return res.status(400).json({ error: "username is required" });
      const user = await sleeper.getUser(username);
      const state = await sleeper.getState();
      const season = String(req.query.season ?? state.league_season ?? state.season);
      const leagues = await sleeper.getUserLeagues(user.user_id, season);
      res.json({
        user: { userId: user.user_id, username: user.username, displayName: user.display_name, avatar: user.avatar },
        season,
        leagues: leagues.map((l) => ({
          id: l.league_id,
          name: l.name,
          season: l.season,
          status: l.status,
          avatar: l.avatar,
          totalRosters: l.total_rosters,
          detected: detectValuesParams(l),
        })),
      });
    }),
  );

  app.get(
    "/api/league/:id",
    wrap(async (req, res) => {
      const bundle = await loadLeagueBundle(sleeper, provider, req.params.id, req.query as Record<string, unknown>);
      res.json({
        league: {
          id: bundle.league.league_id,
          name: bundle.league.name,
          season: bundle.league.season,
          rosterPositions: bundle.league.roster_positions,
          detected: bundle.detected,
        },
        values: valuesMeta(bundle.values),
        teams: bundle.teams,
      });
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SleeperError) return res.status(err.status).json({ error: err.message });
    if (err instanceof NoValuesError) return res.status(503).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: (err as Error).message ?? "Internal error" });
  });

  return app;
}
