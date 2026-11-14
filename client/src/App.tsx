import { useCallback, useEffect, useState } from "react";
import {
  fetchLeague,
  fetchLeagues,
  fetchTrades,
  type EspnCredentials,
  type LeagueResponse,
  type LeaguesResponse,
  type TradesResponse,
  type ValueSource,
  type ValuesParams,
} from "./api";
import { fantasyCalcEnabled } from "./config";
import { BottomNav, type Tab } from "./components/BottomNav";
import { LeagueBreakdown } from "./components/LeagueBreakdown";
import { LeagueTab } from "./components/LeagueTab";
import { TargetsTab } from "./components/TargetsTab";
import { TradesTab } from "./components/TradesTab";
import { ValueSourceSelect } from "./components/ValueSourceSelect";
import { canonicalSwid, defaultEspnSeason, parseEspnLookup } from "./lib/espn";
import { recordVisit } from "./visits";

const USERNAME_KEY = "fantasytrader.username";
const KEPT_KEY = "fantasytrader.kept";
const PLATFORM_KEY = "fantasytrader.platform";
const ESPN_LEAGUE_KEY = "fantasytrader.espnLeagueId";
const ESPN_SEASON_KEY = "fantasytrader.espnSeason";
const ESPN_AUTH_KEY = "fantasytrader.espnAuth";

type Platform = "sleeper" | "espn";

function readPlatform(): Platform {
  return localStorage.getItem(PLATFORM_KEY) === "espn" ? "espn" : "sleeper";
}

function readEspnAuth(): EspnCredentials {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ESPN_AUTH_KEY) ?? "{}") as EspnCredentials;
    return {
      espnS2: typeof parsed.espnS2 === "string" ? parsed.espnS2 : "",
      swid: typeof parsed.swid === "string" ? parsed.swid : "",
    };
  } catch {
    return {};
  }
}

function writeEspnAuth(auth: EspnCredentials) {
  if (!auth.espnS2 && !auth.swid) {
    sessionStorage.removeItem(ESPN_AUTH_KEY);
    return;
  }
  sessionStorage.setItem(ESPN_AUTH_KEY, JSON.stringify(auth));
}

function readKept(leagueId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "{}") as Record<string, unknown>;
    const ids = all[leagueId];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeKept(leagueId: string, ids: string[]) {
  let all: Record<string, string[]> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "{}") as Record<string, string[]>;
    if (parsed && typeof parsed === "object") all = parsed;
  } catch {
    all = {};
  }
  all[leagueId] = ids;
  localStorage.setItem(KEPT_KEY, JSON.stringify(all));
}

export default function App() {
  const [tab, setTab] = useState<Tab>("league");
  const [platform, setPlatform] = useState<Platform>(readPlatform);
  const [username, setUsername] = useState(() => localStorage.getItem(USERNAME_KEY) ?? "");
  const [espnLeagueId, setEspnLeagueId] = useState(() => localStorage.getItem(ESPN_LEAGUE_KEY) ?? "");
  const [espnSeason, setEspnSeason] = useState(() => localStorage.getItem(ESPN_SEASON_KEY) ?? defaultEspnSeason());
  const [espnAuth, setEspnAuth] = useState<EspnCredentials>(readEspnAuth);

  const [leagues, setLeagues] = useState<LeaguesResponse | null>(null);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState<string | null>(() =>
    readPlatform() === "espn" ? localStorage.getItem(ESPN_LEAGUE_KEY) : null,
  );
  const [overrides, setOverrides] = useState<ValuesParams | null>(null);
  const [league, setLeague] = useState<LeagueResponse | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [myRosterId, setMyRosterId] = useState<number | null>(null);
  const [valueSource, setValueSource] = useState<ValueSource>(fantasyCalcEnabled ? "fantasycalc" : "sleeper");

  const [targets, setTargets] = useState<string[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const [mode, setMode] = useState<2 | 3>(2);
  const [tolerance, setTolerance] = useState(0.1);
  const [trades, setTrades] = useState<TradesResponse | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  const searchLeagues = useCallback((name: string) => {
    localStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
    setLeagueId(null);
    setLeagues(null);
    setLeaguesError(null);
    setLeaguesLoading(true);
    fetchLeagues(name)
      .then(setLeagues)
      .catch((e: Error) => setLeaguesError(e.message))
      .finally(() => setLeaguesLoading(false));
  }, []);

  useEffect(() => {
    recordVisit();
  }, []);

  useEffect(() => {
    if (readPlatform() === "sleeper" && username) searchLeagues(username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePlatform = (next: Platform) => {
    setPlatform(next);
    localStorage.setItem(PLATFORM_KEY, next);
    pickLeague(null);
    setLeagues(null);
    setLeaguesError(null);
    if (next === "sleeper" && username) searchLeagues(username);
  };

  const searchEspn = (input: { leagueId: string; season: string; espnS2: string; swid: string }) => {
    let parsed: { leagueId: string; season: string };
    try {
      parsed = parseEspnLookup(input.leagueId, input.season);
    } catch (e) {
      setLeaguesError((e as Error).message);
      return;
    }
    const auth = { espnS2: input.espnS2.trim(), swid: input.swid.trim() };
    setEspnLeagueId(parsed.leagueId);
    setEspnSeason(parsed.season);
    setEspnAuth(auth);
    localStorage.setItem(ESPN_LEAGUE_KEY, parsed.leagueId);
    localStorage.setItem(ESPN_SEASON_KEY, parsed.season);
    writeEspnAuth(auth);
    setLeaguesError(null);
    pickLeague(parsed.leagueId);
  };

  const pickLeague = (id: string | null) => {
    setLeagueId(id);
    if (!id && platform === "espn") localStorage.removeItem(ESPN_LEAGUE_KEY);
    setLeague(null);
    setOverrides(null);
    setTargets([]);
    setKept(id ? readKept(id) : []);
    setTrades(null);
    setMyRosterId(null);
  };

  const userId = platform === "espn" ? (canonicalSwid(espnAuth.swid) ?? undefined) : leagues?.user.userId;
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLeagueLoading(true);
    setLeagueError(null);
    fetchLeague(
      leagueId,
      overrides ?? undefined,
      valueSource,
      platform === "espn" ? { season: espnSeason, auth: espnAuth } : undefined,
    )
      .then((res) => {
        if (cancelled) return;
        setLeague(res);
        setMyRosterId((cur) => cur ?? res.teams.find((t) => t.ownerId === userId)?.rosterId ?? null);
      })
      .catch((e: Error) => !cancelled && setLeagueError(e.message))
      .finally(() => !cancelled && setLeagueLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leagueId, overrides, userId, valueSource, platform, espnSeason, espnAuth]);

  const settings = overrides ?? league?.values.requested ?? null;

  const searchTrades = (source: ValueSource) => {
    if (!leagueId || myRosterId == null || targets.length === 0) return;
    setTab("trades");
    setTradesLoading(true);
    setTradesError(null);
    fetchTrades(
      {
        leagueId,
        myRosterId,
        targetPlayerIds: targets,
        excludedPlayerIds: kept,
        mode,
        tolerance,
        values: settings ?? undefined,
        source,
        ...(platform === "espn" ? { platform, season: espnSeason } : {}),
      },
      platform === "espn" ? espnAuth : undefined,
    )
      .then(setTrades)
      .catch((e: Error) => setTradesError(e.message))
      .finally(() => setTradesLoading(false));
  };

  const findTrades = () => searchTrades(valueSource);

  const changeValueSource = (source: ValueSource) => {
    setValueSource(source);
    setTrades(null);
    if (tab === "trades") searchTrades(source);
  };

  const toggleKept = (id: string) => {
    setKept((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (leagueId) writeKept(leagueId, next);
      return next;
    });
    setTrades(null);
  };

  const toggleTarget = (id: string) => {
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
    setTrades(null);
  };

  const ready = Boolean(league && myRosterId != null);

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pt-4 pb-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          AutoFantasy<span className="text-sky-400">Trade</span>
        </h1>
        {league && <span className="max-w-[55%] truncate text-xs text-slate-400">{league.league.name}</span>}
      </header>

      <main>
        {leagueId && <ValueSourceSelect value={valueSource} onChange={changeValueSource} />}
        {tab === "league" && (
          <LeagueTab
            platform={platform}
            onPlatform={changePlatform}
            username={username}
            onSearch={searchLeagues}
            espnLeagueId={espnLeagueId}
            espnSeason={espnSeason}
            espnS2={espnAuth.espnS2 ?? ""}
            espnSwid={espnAuth.swid ?? ""}
            onEspnSearch={searchEspn}
            leagues={leagues}
            leaguesLoading={leaguesLoading}
            leaguesError={leaguesError}
            leagueId={leagueId}
            onPickLeague={pickLeague}
            league={league}
            leagueLoading={leagueLoading}
            leagueError={leagueError}
            settings={settings}
            onSettings={(p) => {
              setOverrides(p);
              setTrades(null);
            }}
            myRosterId={myRosterId}
            kept={kept}
            onToggleKept={toggleKept}
            onPickRoster={(id) => {
              setMyRosterId(id);
              setTargets([]);
              setTrades(null);
            }}
          />
        )}
        {tab === "compare" && league && myRosterId != null && (
          <LeagueBreakdown teams={league.teams} rosterId={myRosterId} profiles={league.profiles} />
        )}
        {tab === "targets" && league && myRosterId != null && (
          <TargetsTab
            league={league}
            myRosterId={myRosterId}
            targets={targets}
            onToggle={toggleTarget}
            onClear={() => setTargets([])}
            onFind={findTrades}
          />
        )}
        {tab === "trades" && league && myRosterId != null && (
          <TradesTab
            league={league}
            myRosterId={myRosterId}
            targets={targets}
            keptCount={kept.length}
            mode={mode}
            onMode={(m) => {
              setMode(m);
              setTrades(null);
            }}
            tolerance={tolerance}
            onTolerance={setTolerance}
            onFind={findTrades}
            loading={tradesLoading}
            error={tradesError}
            result={trades}
          />
        )}
      </main>

      <BottomNav
        tab={tab}
        onTab={setTab}
        enabled={{ league: true, compare: ready, targets: ready, trades: ready }}
        badges={{ targets: targets.length, trades: trades?.suggestions.length }}
      />
    </div>
  );
}
