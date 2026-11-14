import { useState, type FormEvent, type SelectHTMLAttributes } from "react";
import type { LeagueResponse, LeaguesResponse, ValuesParams } from "../api";
import { avatarUrl, formatValue, settingsLabel, timeAgo } from "../lib/format";
import { ValuesAttribution } from "./ValuesAttribution";
import { NeedsChips } from "./NeedsChips";
import { Card, ErrorNote, PlayerRow, Spinner } from "./ui";

type Platform = "sleeper" | "espn";

interface Props {
  platform: Platform;
  onPlatform: (platform: Platform) => void;
  username: string;
  onSearch: (username: string) => void;
  espnLeagueId: string;
  espnSeason: string;
  espnS2: string;
  espnSwid: string;
  onEspnSearch: (input: { leagueId: string; season: string; espnS2: string; swid: string }) => void;
  leagues: LeaguesResponse | null;
  leaguesLoading: boolean;
  leaguesError: string | null;
  leagueId: string | null;
  onPickLeague: (id: string | null) => void;
  league: LeagueResponse | null;
  leagueLoading: boolean;
  leagueError: string | null;
  settings: ValuesParams | null;
  onSettings: (p: ValuesParams) => void;
  myRosterId: number | null;
  onPickRoster: (id: number) => void;
  kept: string[];
  onToggleKept: (playerId: string) => void;
}

const selectCls =
  "min-h-11 w-full appearance-none rounded-xl bg-slate-800 pl-3 pr-12 text-sm text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500";

function FieldSelect({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`relative ${className}`}>
      <select {...props} className={selectCls} />
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
      </svg>
    </div>
  );
}

const fieldCls =
  "min-h-11 min-w-0 rounded-xl bg-slate-800 px-3 text-base ring-1 ring-slate-700 focus:outline-none focus:ring-sky-500";

export function LeagueTab(props: Props) {
  const [draft, setDraft] = useState(props.username);
  const [espnId, setEspnId] = useState(props.espnLeagueId);
  const [season, setSeason] = useState(props.espnSeason);
  const [espnS2, setEspnS2] = useState(props.espnS2);
  const [swid, setSwid] = useState(props.espnSwid);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) props.onSearch(draft.trim());
  };
  const submitEspn = (e: FormEvent) => {
    e.preventDefault();
    props.onEspnSearch({ leagueId: espnId, season, espnS2, swid });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="League host">
          {(
            [
              ["sleeper", "Sleeper"],
              ["espn", "ESPN"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={props.platform === id}
              onClick={() => props.onPlatform(id)}
              className={`min-h-11 rounded-full text-sm font-medium ring-1 ${
                props.platform === id
                  ? "bg-sky-500 text-slate-950 ring-sky-400"
                  : "bg-slate-800 text-slate-300 ring-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {props.platform === "sleeper" ? (
          <form onSubmit={submit} className="flex gap-2">
            <label className="sr-only" htmlFor="username">
              Sleeper username
            </label>
            <input
              id="username"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Sleeper username"
              autoCapitalize="none"
              autoCorrect="off"
              className={`${fieldCls} flex-1`}
            />
            <button type="submit" className="min-h-11 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950">
              Find leagues
            </button>
          </form>
        ) : (
          <form onSubmit={submitEspn} className="space-y-2">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="espn-league">
                ESPN league id or URL
              </label>
              <input
                id="espn-league"
                value={espnId}
                onChange={(e) => setEspnId(e.target.value)}
                placeholder="League id or URL"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`${fieldCls} flex-1`}
              />
              <label className="sr-only" htmlFor="espn-season">
                Season
              </label>
              <input
                id="espn-season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                inputMode="numeric"
                aria-label="Season"
                className={`${fieldCls} w-24`}
              />
            </div>
            <details className="rounded-xl bg-slate-800/60 px-3 py-2 ring-1 ring-slate-700">
              <summary className="cursor-pointer text-sm text-slate-300">Private league cookies</summary>
              <div className="mt-3 space-y-2">
                <input
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  placeholder="espn_s2"
                  aria-label="espn_s2 cookie"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${fieldCls} w-full`}
                />
                <input
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  placeholder="SWID"
                  aria-label="SWID cookie"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${fieldCls} w-full`}
                />
                <p className="text-xs text-slate-400">
                  On fantasy.espn.com, copy the espn_s2 and SWID cookies. They stay in this browser tab and are sent
                  only to open this league.
                </p>
              </div>
            </details>
            <button type="submit" className="min-h-11 w-full rounded-xl bg-sky-500 text-sm font-semibold text-slate-950">
              Load league
            </button>
          </form>
        )}
      </Card>

      {props.leaguesLoading && <Spinner label="Loading leagues…" />}
      {props.leaguesError && <ErrorNote message={props.leaguesError} />}

      {props.platform === "sleeper" && props.leagues && !props.leagueId && (
        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-400">
            {props.leagues.user.displayName}'s {props.leagues.season} leagues
          </h2>
          {props.leagues.leagues.length === 0 && <p className="px-1 text-sm text-slate-400">No leagues this season.</p>}
          <ul className="grid gap-2 md:grid-cols-2">
            {props.leagues.leagues.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => props.onPickLeague(l.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-900 p-3 text-left ring-1 ring-slate-800 hover:ring-sky-500"
                >
                  <Avatar src={avatarUrl(l.avatar)} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.name}</div>
                    <div className="truncate text-xs text-slate-400">{settingsLabel(l.detected)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.leagueId && (
        <button
          type="button"
          onClick={() => props.onPickLeague(null)}
          className="min-h-11 px-1 text-sm text-sky-300"
        >
          {props.platform === "espn" ? "← Different league" : "← All leagues"}
        </button>
      )}
      {props.leagueLoading && <Spinner label="Loading rosters and values…" />}
      {props.leagueError && <ErrorNote message={props.leagueError} />}
      {props.league && props.settings && <LeagueDetails {...props} league={props.league} settings={props.settings} />}
    </div>
  );
}

function LeagueDetails({
  league,
  settings,
  onSettings,
  myRosterId,
  onPickRoster,
  kept,
  onToggleKept,
}: Props & { league: LeagueResponse; settings: ValuesParams }) {
  const me = league.teams.find((t) => t.rosterId === myRosterId);
  const profile = league.profiles.find((p) => p.rosterId === myRosterId);
  const v = league.values;

  return (
    <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{league.league.name}</h2>
        <p className="text-xs text-slate-400">
          Detected from {league.league.platform === "espn" ? "ESPN" : "Sleeper"}: {settingsLabel(league.league.detected)}
        </p>
        {league.warnings?.map((warning) => (
          <p key={warning} className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
            {warning}
          </p>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <FieldSelect
            aria-label="League type"
            value={String(settings.isDynasty)}
            onChange={(e) => onSettings({ ...settings, isDynasty: e.target.value === "true" })}
          >
            <option value="true">Dynasty</option>
            <option value="false">Redraft</option>
          </FieldSelect>
          <FieldSelect
            aria-label="QB format"
            value={settings.numQbs}
            onChange={(e) => onSettings({ ...settings, numQbs: Number(e.target.value) as 1 | 2 })}
          >
            <option value={1}>1QB</option>
            <option value={2}>Superflex</option>
          </FieldSelect>
          <FieldSelect
            aria-label="Team count"
            value={settings.numTeams}
            onChange={(e) => onSettings({ ...settings, numTeams: Number(e.target.value) })}
          >
            {[8, 10, 12, 14, 16].map((n) => (
              <option key={n} value={n}>
                {n} teams
              </option>
            ))}
            {![8, 10, 12, 14, 16].includes(settings.numTeams) && (
              <option value={settings.numTeams}>{settings.numTeams} teams</option>
            )}
          </FieldSelect>
          <FieldSelect
            aria-label="Scoring"
            value={settings.ppr}
            onChange={(e) => onSettings({ ...settings, ppr: Number(e.target.value) as 0 | 0.5 | 1 })}
          >
            <option value={0}>Standard</option>
            <option value={0.5}>Half PPR</option>
            <option value={1}>PPR</option>
          </FieldSelect>
          <FieldSelect
            aria-label="Tight end premium"
            className="col-span-2"
            value={settings.tep}
            onChange={(e) => onSettings({ ...settings, tep: e.target.value as ValuesParams["tep"] })}
          >
            <option value="none">No TE premium</option>
            <option value="te+">TE+ premium</option>
            <option value="te++">TE++ premium</option>
          </FieldSelect>
        </div>
        <div className="space-y-1 text-xs text-slate-400">
          <p>
            {v.basis ?? `Values snapshot: ${settingsLabel(v.used)}`} · pulled {timeAgo(v.fetchedAt)}
          </p>
          {!v.exact && (
            <p className="rounded-lg bg-amber-500/10 p-2 text-amber-300 ring-1 ring-amber-500/30">
              {v.basis
                ? `These rankings don't include ${settingsLabel(v.requested)}. Showing ${settingsLabel(v.used)}.`
                : `No snapshot for ${settingsLabel(v.requested)}. Using the nearest one (${settingsLabel(v.used)}).`}
            </p>
          )}
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-400">My team</span>
          <FieldSelect
            value={myRosterId ?? ""}
            onChange={(e) => onPickRoster(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose your team
            </option>
            {league.teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.teamName} ({t.ownerName})
              </option>
            ))}
          </FieldSelect>
        </label>
        <NeedsChips profile={profile} />
      </Card>

      {me && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold">My roster</h3>
            <span className="text-xs text-slate-400">Total {formatValue(me.totalValue)}</span>
          </div>
          <p className="mb-2 text-xs text-slate-400">
            {kept.length > 0
              ? `${kept.length} kept off the trade block. Tap Kept to make them available again.`
              : "Tap Keep to leave a player off the trade block."}
          </p>
          <ValuesAttribution source={league.values.source} className="mb-2" />
          <div className="divide-y divide-slate-800">
            {me.players
              .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
              .map((p) => {
                const isKept = kept.includes(p.id);
                return (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    right={
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-pressed={isKept}
                          onClick={() => onToggleKept(p.id)}
                          className={`min-h-8 shrink-0 rounded-full px-2.5 text-xs font-medium ring-1 ${
                            isKept
                              ? "bg-amber-500/15 text-amber-200 ring-amber-500/40"
                              : "text-slate-400 ring-slate-700"
                          }`}
                        >
                          {isKept ? "Kept" : "Keep"}
                        </button>
                        <span className="w-12 text-right text-sm tabular-nums text-slate-200">
                          {formatValue(p.value)}
                        </span>
                      </div>
                    }
                  />
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Avatar({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-full bg-slate-800" />
  ) : (
    <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800" />
  );
}
