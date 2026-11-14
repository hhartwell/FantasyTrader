# FantasyTrader (POC)

Loads a Sleeper or ESPN league and suggests fair 2-team and 3-team trades. Player values
come from FantasyCalc snapshots by default. You can switch a league to Sleeper ADP
or Yahoo's overall rank instead.
Private development proof of concept.

## Run

```bash
npm install
docker compose up --build        # client http://localhost:5173, API http://localhost:3001
```

`docker compose up` also starts an hourly pull beat in its own process. The API only reads the snapshots that beat writes, and it never calls FantasyCalc. Each tick pulls Sleeper players and the Sleeper/Yahoo rankings. FantasyCalc values are included only when `FANTASYCALC_ENABLED=true` in `.env` (it defaults to false). The scripts still skip a refetch that is inside the source window: Sleeper players 24 hours, rankings 6 hours, and each FantasyCalc combo 3 hours.

Without Docker, start the same beat with `npm run data:schedule`.

Pull by hand when you want a snapshot now:

```bash
npm run data:pull-players                                   # Sleeper players DB, including ESPN ids, max once a day
npm run data:pull-values -- --dynasty=true --qbs=1 --teams=12 --ppr=0.5   # one combo
npm run data:pull-values                                    # 36 combos, no TE premium
npm run data:pull-values -- --tep=te+                       # TE+ board (te++ or all also work)
npm run data:pull-rankings                                  # Sleeper ADP and Yahoo overall rank
```

Pull from inside Docker instead: `docker compose run --rm server npm run data:pull-values -- --qbs=1`.

If a host port is taken, override it: `SERVER_HOST_PORT=3011 CLIENT_HOST_PORT=5174 docker compose up`.
The client reaches the API over the Docker network, so only the host mapping changes.

Without Docker: `npm run dev` (server on 3001, Vite on 5173 with `/api` proxied).

ESPN leagues load by league id, or by pasting the league URL. Public leagues need nothing else. Private leagues need the `espn_s2` and `SWID` cookies from a signed-in fantasy.espn.com session. The browser keeps those cookies in the tab, and the API sends them only on the ESPN request. Roster players match the local player list on ESPN id, then on name. Run `npm run data:pull-players` so the id match is available. A keeper league is valued as dynasty, the same way a Sleeper keeper league is.

Tests: `npm test` (Vitest, no network). Typecheck: `npm run typecheck`.

Admin is at `/admin` (http://localhost:5173/admin), separate from the app. Set `ADMIN_PASSWORD` in `.env` (`ADMIN_USERNAME` defaults to `admin`). Visit counts require that login. The main app does not link to it.

## Layout

- `server/src/sleeper.ts`: Sleeper client with a 5-minute in-memory cache
- `server/src/espn.ts`: ESPN league client. Maps a league onto the same roster shape Sleeper uses
- `server/src/values/`: `ValuesProvider` interface, FantasyCalc snapshots, and Sleeper/Yahoo ranking snapshots
- `server/src/positionalNeeds.ts`: per-team surplus and deficit by position
- `server/src/tradeEngine.ts`: package valuation, 2-team search, needs-driven 3-team search
- `server/scripts/`: hourly pull beat and the manual pull scripts it runs
- `client/`: Vite + React + Tailwind, mobile-first

