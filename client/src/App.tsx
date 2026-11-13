import { useCallback, useEffect, useState } from "react";
import {
  fetchLeague,
  fetchLeagues,
  fetchTrades,
  type LeagueResponse,
  type LeaguesResponse,
  type TradesResponse,
  type ValuesParams,
} from "./api";
import { BottomNav, type Tab } from "./components/BottomNav";
import { LeagueTab } from "./components/LeagueTab";
import { TargetsTab } from "./components/TargetsTab";
import { TradesTab } from "./components/TradesTab";

const USERNAME_KEY = "fantasytrader.username";

export default function App() {
  const [tab, setTab] = useState<Tab>("league");
  const [username, setUsername] = useState(() => localStorage.getItem(USERNAME_KEY) ?? "");

  const [leagues, setLeagues] = useState<LeaguesResponse | null>(null);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<ValuesParams | null>(null);
  const [league, setLeague] = useState<LeagueResponse | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [myRosterId, setMyRosterId] = useState<number | null>(null);

  const [targets, setTargets] = useState<string[]>([]);
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
    if (username) searchLeagues(username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickLeague = (id: string | null) => {
    setLeagueId(id);
    setLeague(null);
    setOverrides(null);
    setTargets([]);
    setTrades(null);
    setMyRosterId(null);
  };

  const userId = leagues?.user.userId;
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLeagueLoading(true);
    setLeagueError(null);
    fetchLeague(leagueId, overrides ?? undefined)
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
  }, [leagueId, overrides, userId]);

  const settings = overrides ?? league?.values.requested ?? null;

  const findTrades = () => {
    if (!leagueId || myRosterId == null || targets.length === 0) return;
    setTab("trades");
    setTradesLoading(true);
    setTradesError(null);
    fetchTrades({ leagueId, myRosterId, targetPlayerIds: targets, mode, tolerance, values: settings ?? undefined })
      .then(setTrades)
      .catch((e: Error) => setTradesError(e.message))
      .finally(() => setTradesLoading(false));
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
          Fantasy<span className="text-sky-400">Trader</span>
        </h1>
        {league && <span className="max-w-[55%] truncate text-xs text-slate-400">{league.league.name}</span>}
      </header>

      <main>
        {tab === "league" && (
          <LeagueTab
            username={username}
            onSearch={searchLeagues}
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
            onPickRoster={(id) => {
              setMyRosterId(id);
              setTargets([]);
              setTrades(null);
            }}
          />
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
        enabled={{ league: true, targets: ready, trades: ready }}
        badges={{ targets: targets.length, trades: trades?.suggestions.length }}
      />
    </div>
  );
}
