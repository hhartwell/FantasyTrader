import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  EspnClient,
  canonicalSwid,
  defaultEspnSeason,
  espnCookieHeader,
  espnRosterPositions,
  parseEspnLeagueId,
  parseEspnSeason,
  readEspnLeague,
} from "../src/espn.js";
import { loadEspnLeagueBundle, unmatchedPlayerWarning } from "../src/leagueData.js";
import { detectValuesParams } from "../src/sleeper.js";
import type { ValuesProvider } from "../src/values/provider.js";
import type { ValuesParams } from "../src/values/snapshotFiles.js";

const params = (over: Partial<ValuesParams> = {}): ValuesParams => ({
  isDynasty: false,
  numQbs: 1,
  numTeams: 12,
  ppr: 1,
  tep: "none",
  ...over,
});

const leagueBody = () => ({
  id: 42,
  seasonId: 2026,
  status: { isActive: true },
  settings: {
    name: "Gridiron",
    size: 2,
    draftSettings: { keeperCount: 3 },
    rosterSettings: {
      lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1, "23": 1, "20": 5, "21": 1, "8": 1 } as Record<
        string,
        number
      >,
    },
    scoringSettings: {
      scoringItems: [{ statId: 53, points: 0.5, pointsOverrides: { "4": 1.5 } }],
    },
  },
  members: [{ id: "{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}", displayName: "Ada" }],
  teams: [
    {
      id: 1,
      location: "Ada",
      nickname: "Aces",
      logo: "https://a.espncdn.com/logo.png",
      primaryOwner: "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
      roster: {
        entries: [
          {
            playerId: 4040715,
            lineupSlotId: 4,
            playerPoolEntry: { player: { fullName: "Ja'Marr Chase", defaultPositionId: 3 } },
          },
          {
            playerId: 9,
            lineupSlotId: 2,
            playerPoolEntry: { player: { fullName: "James Cook", defaultPositionId: 2 } },
          },
          {
            playerId: 77,
            lineupSlotId: 21,
            playerPoolEntry: { player: { fullName: "Hurt Guy", defaultPositionId: 2 } },
          },
          {
            playerId: 5,
            lineupSlotId: 0,
            playerPoolEntry: { player: { fullName: "Mike Williams", defaultPositionId: 3 } },
          },
        ],
      },
    },
    {
      id: 2,
      location: "Bea",
      nickname: "Bears",
      primaryOwner: "{bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee}",
      roster: { entries: [] },
    },
  ],
});

const players = [
  { id: "100", name: "Ja'Marr Chase", position: "WR", team: "CIN", espnId: "4040715" },
  { id: "200", name: "James Cook III", position: "RB", team: "BUF" },
  { id: "300", name: "Mike Williams", position: "WR", team: null },
  { id: "301", name: "Mike Williams", position: "WR", team: null },
];

describe("ESPN season and cookies", () => {
  it("uses the previous season in January and February", () => {
    expect(defaultEspnSeason(new Date("2026-01-15T00:00:00Z"))).toBe("2025");
    expect(defaultEspnSeason(new Date("2026-03-01T00:00:00Z"))).toBe("2026");
    expect(parseEspnSeason(undefined, new Date("2026-11-14T00:00:00Z"))).toBe("2026");
    expect(parseEspnSeason("2024")).toBe("2024");
    expect(() => parseEspnSeason("26")).toThrow(/four-digit/);
    expect(() => parseEspnLeagueId("https://fantasy.espn.com")).toThrow(/league id/);
  });

  it("normalizes SWID and copies espn_s2 through without encoding it again", () => {
    expect(canonicalSwid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
    expect(espnCookieHeader({ espnS2: "abc%2Fdef", swid: "{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}" })).toBe(
      "espn_s2=abc%2Fdef; SWID={AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}",
    );
    expect(() => espnCookieHeader({ swid: "not a swid" })).toThrow(/SWID/);
    expect(() => espnCookieHeader({ espnS2: "abc;def" })).toThrow(/semicolon/);
  });
});

describe("ESPN league parsing", () => {
  it("detects keeper, superflex, half PPR, and a tight end reception bonus", () => {
    const loaded = readEspnLeague(leagueBody(), players);
    expect(detectValuesParams(loaded.league)).toEqual(params({ isDynasty: true, numQbs: 2, numTeams: 2, ppr: 0.5, tep: "te+" }));
    expect(loaded.league.roster_positions).toEqual([
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "SUPER_FLEX",
      "FLEX",
      "BN",
      "BN",
      "BN",
      "BN",
      "BN",
      "IR",
      "BN",
    ]);
    expect(loaded.league.name).toBe("Gridiron");
  });

  it("maps ESPN ids, then names, and keeps an IR player off the active roster", () => {
    const loaded = readEspnLeague(leagueBody(), players);
    const roster = loaded.rosters[0];
    expect(roster.players).toEqual(["100", "200", "espn:77", "espn:5"]);
    expect(roster.reserve).toEqual(["espn:77"]);
    expect(roster.owner_id).toBe("{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
    expect(loaded.users[0].display_name).toBe("Ada");
    expect(loaded.extras.get(1)?.teamName).toBe("Ada Aces");
    expect(loaded.extras.get(1)?.avatar).toBe("https://a.espncdn.com/logo.png");
    expect(loaded.extras.get(1)?.labels["espn:77"]).toMatchObject({ name: "Hurt Guy", position: "RB" });
    expect(loaded.extras.get(2)?.teamName).toBe("Bea Bears");
  });

  it("counts an unknown lineup slot as a bench spot", () => {
    expect(espnRosterPositions({ "0": 1, "99": 2 })).toEqual(["QB", "BN", "BN"]);
  });

  it("reads a standard league with no reception points as redraft", () => {
    const body = leagueBody();
    body.settings.draftSettings.keeperCount = 0;
    body.settings.scoringSettings.scoringItems = [{ statId: 53, points: 1, pointsOverrides: { "4": 2.5 } }];
    body.settings.rosterSettings.lineupSlotCounts = { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1 };
    const loaded = readEspnLeague(body, []);
    expect(detectValuesParams(loaded.league)).toEqual(
      params({ isDynasty: false, numQbs: 1, numTeams: 2, ppr: 1, tep: "te++" }),
    );
  });
});

describe("ESPN client", () => {
  it("caches the ESPN response and still rematches players on a later read", async () => {
    let calls = 0;
    const known = [...players];
    const client = new EspnClient(
      async (_url, headers) => {
        calls++;
        expect(headers.Cookie).toBeUndefined();
        return { status: 200, body: leagueBody() };
      },
      60_000,
      () => known,
    );
    const first = await client.getLeague("42", "2026");
    known.splice(0, known.length, ...players, { id: "77", name: "Hurt Guy", position: "RB", team: "KC", espnId: "77" });
    const second = await client.getLeague("42", "2026");
    expect(calls).toBe(1);
    expect(first.rosters[0].players).toContain("espn:77");
    expect(second.rosters[0].players).toContain("77");
  });

  it("sends private-league cookies and explains a rejection", async () => {
    const seen: Record<string, string>[] = [];
    const client = new EspnClient(async (_url, headers) => {
      seen.push(headers);
      return { status: 401, body: {} };
    });
    await expect(client.getLeague("42", "2026")).rejects.toThrow(/private/);
    await expect(
      client.getLeague("42", "2026", { espnS2: "abc%2Fdef", swid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    ).rejects.toThrow(/rejected those cookies/);
    expect(seen[1].Cookie).toBe("espn_s2=abc%2Fdef; SWID={AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
  });
});

describe("ESPN league bundle", () => {
  const provider: ValuesProvider = {
    source: { name: "Test", url: "https://example.com" },
    status: () => [],
    getValues: (requested) => ({
      values: new Map([
        ["100", { sleeperId: "100", name: "Ja'Marr Chase", position: "WR", team: "CIN", age: 25, value: 8000 }],
      ]),
      requested,
      used: requested,
      exact: true,
      fetchedAt: "2026-11-14T00:00:00Z",
      source: { name: "Test", url: "https://example.com" },
    }),
  };

  it("prices a matched player and warns about the ones left on ESPN ids", async () => {
    const espn = new EspnClient(async () => ({ status: 200, body: leagueBody() }), 1000, () => players);
    const bundle = await loadEspnLeagueBundle(espn, provider, "42", "2026", undefined, {}, "fantasycalc");
    const aces = bundle.teams.find((team) => team.teamName === "Ada Aces");
    expect(aces?.ownerName).toBe("Ada");
    expect(aces?.avatar).toBe("https://a.espncdn.com/logo.png");
    const chase = aces?.players.find((player) => player.id === "100");
    expect(chase).toMatchObject({ value: 8000, position: "WR", team: "CIN" });
    const hurt = aces?.players.find((player) => player.name === "Hurt Guy");
    expect(hurt).toMatchObject({ id: "espn:77", value: 0, held: "reserve" });
    expect(unmatchedPlayerWarning(bundle.teams)).toMatch(/2 players/);
  });
});

describe("ESPN route", () => {
  it("forwards cookies to ESPN and returns ESPN's failure", async () => {
    let cookie = "";
    const espn = new EspnClient(async (_url, headers) => {
      cookie = headers.Cookie ?? "";
      return { status: 404, body: {} };
    });
    const app = createApp({ espn, admin: null });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/league/42?platform=espn&season=2026`, {
        headers: { "x-espn-s2": "abc%2Fdef", "x-espn-swid": "{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}" },
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/not found/);
      expect(cookie).toBe("espn_s2=abc%2Fdef; SWID={AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
