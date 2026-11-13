import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminLogin, adminLogout, adminSession, fetchVisits, type VisitsResponse } from "../api";
import { Card, ErrorNote, Spinner } from "./ui";

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, (month ?? 1) - 1, date ?? 1)));
}

export function Admin() {
  const [username, setUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    document.title = username ? "Site administration | FantasyTrader" : "Log in | FantasyTrader";
    return () => {
      document.title = "FantasyTrader";
    };
  }, [username]);

  useEffect(() => {
    let cancelled = false;
    adminSession()
      .then((session) => {
        if (!cancelled) setUsername(session.username);
      })
      .catch(() => {
        if (!cancelled) setUsername(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm font-semibold">FantasyTrader administration</p>
          {username && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-400">{username}</span>
              <button
                type="button"
                className="font-medium text-sky-300"
                onClick={() => {
                  void adminLogout().finally(() => setUsername(null));
                }}
              >
                Log out
              </button>
              <a href="/" className="text-slate-300">
                View site
              </a>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 pb-16">
        {username === undefined && <Spinner label="Checking admin session" />}
        {username === null && <Login onSuccess={setUsername} />}
        {username && <Visits />}
      </main>
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    adminLogin(username, password)
      .then((session) => onSuccess(session.username))
      .catch((e: Error) => setError(e.message))
      .finally(() => setPending(false));
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800">
      <h1 className="text-lg font-semibold">Log in</h1>
      {error && <ErrorNote message={error} />}
      <label className="block text-sm">
        <span className="text-slate-300">Username</span>
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl bg-slate-800 px-3 text-sm ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-300">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl bg-slate-800 px-3 text-sm ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !username || !password}
        className="min-h-11 w-full rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 disabled:opacity-40"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

function Visits() {
  const [report, setReport] = useState<VisitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVisits()
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayCount = report?.days.find((d) => d.day === report.today)?.uniques ?? 0;
  const total = report?.days.reduce((sum, d) => sum + d.uniques, 0) ?? 0;
  const max = Math.max(1, ...(report?.days.map((d) => d.uniques) ?? []));

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight">Unique visits</h1>
      <p className="mt-1 mb-6 text-xs text-slate-400">One browser counts once per UTC day.</p>
      {loading && !report && <Spinner label="Loading visits" />}
      {error && (
        <div className="mb-4">
          <ErrorNote message={error} />
        </div>
      )}
      {report && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Card>
              <p className="text-xs text-slate-400">Today</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{todayCount}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDay(report.today)} UTC</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-400">All days</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{total}</p>
              <p className="mt-1 text-xs text-slate-500">Sum of daily uniques</p>
            </Card>
          </div>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Per day</h2>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="text-xs font-medium text-sky-300 disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
            <ul className="space-y-3">
              {report.days.map((d) => (
                <li key={d.day}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className={d.day === report.today ? "font-medium" : "text-slate-300"}>
                      {d.day === report.today ? `Today · ${formatDay(d.day)}` : formatDay(d.day)}
                    </span>
                    <span className="tabular-nums">{d.uniques}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden>
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{ width: d.uniques === 0 ? "0%" : `${Math.max((d.uniques / max) * 100, 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {total === 0 && <p className="mt-4 text-sm text-slate-400">No visits yet.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
