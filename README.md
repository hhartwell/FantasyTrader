# FantasyTrader (POC)

Loads a Sleeper league and suggests fair 2-team and 3-team trades. Player values
come from FantasyCalc snapshots by default. You can switch a league to Sleeper ADP
or Yahoo's overall rank instead.
Private development proof of concept.

## Run

```bash
# 1. Pull data by hand (the app never calls FantasyCalc at runtime)
npm install
npm run data:pull-players                                   # Sleeper players DB, max once a day
npm run data:pull-values -- --dynasty=true --qbs=1 --teams=12 --ppr=0.5   # one combo
npm run data:pull-values                                    # 36 combos, no TE premium
npm run data:pull-values -- --tep=te+                       # TE+ board (te++ or all also work)
npm run data:pull-rankings                                  # Sleeper ADP and Yahoo overall rank

# 2. Start everything
docker compose up --build        # client http://localhost:5173, API http://localhost:3001
```

Pull from inside Docker instead: `docker compose run --rm server npm run data:pull-values -- --qbs=1`.

If a host port is taken, override it: `SERVER_HOST_PORT=3011 CLIENT_HOST_PORT=5174 docker compose up`.
The client reaches the API over the Docker network, so only the host mapping changes.

Without Docker: `npm run dev` (server on 3001, Vite on 5173 with `/api` proxied).

Tests: `npm test` (Vitest, no network). Typecheck: `npm run typecheck`.

## FantasyCalc terms

- Only `server/scripts/pullValues.ts` calls `GET https://api.fantasycalc.com/values/current`.
It refuses to refetch a parameter set pulled less than 3 hours ago and waits between calls
(`--delay-ms`, default 5000).
- Snapshots live in `data/values/{isDynasty}-{numQbs}qb-{numTeams}t-{ppr}ppr.json` (git-ignored),
with `-teplus` or `-teplusplus` added when a tight end premium board is pulled. They are shared
by every user and request. Missing settings fall back to the nearest snapshot, and the UI says so.
The default pull is no TE premium; pass `--tep=te+`, `--tep=te++`, or `--tep=all` to fetch those boards.
- Sleeper ADP and Yahoo overall rank are separate snapshots in `data/rankings/` (also git-ignored),
pulled by `npm run data:pull-rankings`. The server never calls those APIs during a request.
A rank is converted to a trade value in the app; it is not a published trade price.
Sleeper ADP follows dynasty, superflex, and PPR. Yahoo is one overall list.
- Values are attributed with a link to fantasycalc.com next to every values list and trade card,
plus a static link in `client/index.html`.
- Values sit behind the `ValuesProvider` interface (`server/src/values/provider.ts`) so the source
can be swapped. Get FantasyCalc's written permission before any public release.

## Layout

- `server/src/sleeper.ts`: Sleeper client with a 5-minute in-memory cache
- `server/src/values/`: `ValuesProvider` interface, FantasyCalc snapshots, and Sleeper/Yahoo ranking snapshots
- `server/src/positionalNeeds.ts`: per-team surplus and deficit by position
- `server/src/tradeEngine.ts`: package valuation, 2-team search, needs-driven 3-team search
- `server/scripts/`: manual pull scripts
- `client/`: Vite + React + Tailwind, mobile-first

API: `GET /api/leagues?username=`, `GET /api/league/:id`, `POST /api/trades`, `GET /api/values/status`.
