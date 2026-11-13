# FantasyTrader (POC)

Loads a Sleeper league, values players from locally stored FantasyCalc snapshots
(dynasty or redraft), and suggests fair 2-team and 3-team trades for the players you want.
Private development proof of concept.

## Run

```bash
# 1. Pull data by hand (the app never calls FantasyCalc at runtime)
npm install
npm run data:pull-players                                   # Sleeper players DB, max once a day
npm run data:pull-values -- --dynasty=true --qbs=1 --teams=12 --ppr=0.5   # one combo
npm run data:pull-values                                    # full 36-combo matrix

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
- Snapshots live in `data/values/{isDynasty}-{numQbs}qb-{numTeams}t-{ppr}ppr.json` (git-ignored)
  and are shared by every user and request. Missing settings fall back to the nearest snapshot,
  and the UI says so.
- Values are attributed with a link to fantasycalc.com next to every values list and trade card,
  plus a static link in `client/index.html`.
- Values sit behind the `ValuesProvider` interface (`server/src/values/provider.ts`) so the source
  can be swapped. Get FantasyCalc's written permission before any public release.

## Layout

- `server/src/sleeper.ts`: Sleeper client with a 5-minute in-memory cache
- `server/src/values/`: `ValuesProvider` interface and the FantasyCalc snapshot provider
- `server/src/positionalNeeds.ts`: per-team surplus and deficit by position
- `server/src/tradeEngine.ts`: package valuation, 2-team search, needs-driven 3-team search
- `server/scripts/`: manual pull scripts
- `client/`: Vite + React + Tailwind, mobile-first

API: `GET /api/leagues?username=`, `GET /api/league/:id`, `POST /api/trades`, `GET /api/values/status`.
