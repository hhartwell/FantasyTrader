import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { VALUES_DIR, SLEEPER_RANKINGS_FILE, YAHOO_RANKINGS_FILE, fantasyCalcEnabled } from "./config.js";
import { loadLeagueBundle, NoValuesError, valuesMeta } from "./leagueData.js";
import { detectValuesParams, SleeperClient, SleeperError } from "./sleeper.js";
import { buildNeedsContext, leagueProfiles } from "./positionalNeeds.js";
import { suggestTrades } from "./tradeEngine.js";
import { FantasyCalcSnapshotProvider } from "./values/fantasyCalcSnapshot.js";
import { RankingSnapshotProvider } from "./values/rankingSnapshot.js";
import type { ValuesProvider } from "./values/provider.js";
import { parseValueSource, type ValueSourceId } from "./values/valueSource.js";

export interface AppDeps {
  sleeper?: SleeperClient;
  provider?: ValuesProvider;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function createApp(deps: AppDeps = {}) {
  const sleeper = deps.sleeper ?? new SleeperClient();
  const fantasyCalc = deps.provider ?? new FantasyCalcSnapshotProvider(VALUES_DIR);
  const sleeperRanks = new RankingSnapshotProvider(
    SLEEPER_RANKINGS_FILE,
    { name: "Sleeper", url: "https://sleeper.com" },
    "sleeper",
  );
  const yahooRanks = new RankingSnapshotProvider(
    YAHOO_RANKINGS_FILE,
    { name: "Yahoo Fantasy", url: "https://football.fantasysports.yahoo.com/f1/public_prerank" },
    "yahoo",
  );
  const providerFor = (source: ValueSourceId): ValuesProvider => {
    if (source === "yahoo") return yahooRanks;
    if (source === "sleeper" || !fantasyCalcEnabled) return sleeperRanks;
    return fantasyCalc;
  };

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true, fantasyCalcEnabled }));

  app.get("/api/values/status", (_req, res) => {
    res.json({
      fantasyCalcEnabled,
      ...(fantasyCalcEnabled ? { source: fantasyCalc.source, snapshots: fantasyCalc.status() } : {}),
      rankings: [sleeperRanks.summary(), yahooRanks.summary()].filter((s) => s != null),
    });
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
      const bundle = await loadLeagueBundle(
        sleeper,
        providerFor(parseValueSource(req.query.source)),
        req.params.id,
        req.query as Record<string, unknown>,
        parseValueSource(req.query.source),
      );
      const needs = buildNeedsContext(bundle.teams, bundle.league.roster_positions);
      res.json({
        profiles: [...leagueProfiles(bundle.teams, needs).values()],
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

  app.post(
    "/api/trades",
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const leagueId = String(body.leagueId ?? "");
      const myRosterId = Number(body.myRosterId);
      const targetPlayerIds: string[] = Array.isArray(body.targetPlayerIds) ? body.targetPlayerIds.map(String) : [];
      const excludedPlayerIds: string[] = Array.isArray(body.excludedPlayerIds)
        ? body.excludedPlayerIds.map(String)
        : [];
      const mode = Number(body.mode) === 3 ? 3 : 2;
      let tolerance = Number(body.tolerance ?? 0.1);
      if (tolerance > 1) tolerance /= 100;
      if (!leagueId || !Number.isFinite(myRosterId) || targetPlayerIds.length === 0) {
        return res.status(400).json({ error: "leagueId, myRosterId, and targetPlayerIds are required" });
      }
      if (!(tolerance > 0 && tolerance <= 0.3)) {
        return res.status(400).json({ error: "tolerance must be between 0 and 0.3 (30%)" });
      }
      const source = parseValueSource(body.source);
      const bundle = await loadLeagueBundle(sleeper, providerFor(source), leagueId, body.values ?? {}, source);
      const result = suggestTrades({
        teams: bundle.teams.map((t) => ({ rosterId: t.rosterId, name: t.teamName, players: t.players })),
        rosterPositions: bundle.league.roster_positions,
        myRosterId,
        targetPlayerIds,
        excludedPlayerIds,
        mode,
        tolerance,
        limit: 10,
      });
      res.json({ values: valuesMeta(bundle.values), mode, tolerance, ...result });
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
