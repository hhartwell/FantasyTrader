import type { EnginePlayer, EngineTeam } from "../src/tradeEngine.js";

export const ROSTER_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN"];

let seq = 0;
const p = (position: string, value: number, name?: string): EnginePlayer => {
  seq++;
  return { id: `p${seq}`, name: name ?? `${position}${seq}`, position, value };
};

/**
 * Four-team league built so needs complement each other:
 *  1 (me):  WR surplus, RB deficit
 *  2 (B):   owns the star RB target, RB surplus, TE deficit
 *  3 (C):   TE + RB surplus, WR deficit
 *  4:       balanced-ish, TE deficit
 */
export function fixtureLeague(): { teams: EngineTeam[]; star: EnginePlayer } {
  seq = 0;
  const star = p("RB", 9000, "Star RB");
  const teams: EngineTeam[] = [
    {
      rosterId: 1,
      name: "Me",
      players: [
        p("QB", 6000),
        p("RB", 3000),
        p("RB", 300),
        p("WR", 7000),
        p("WR", 6500),
        p("WR", 6000),
        p("WR", 5500),
        p("WR", 5000),
        p("TE", 2500),
      ],
    },
    {
      rosterId: 2,
      name: "B",
      players: [
        p("QB", 5000),
        star,
        p("RB", 6000),
        p("RB", 5000),
        p("RB", 4500),
        p("WR", 4000),
        p("WR", 3500),
        p("WR", 1200),
        p("TE", 400),
      ],
    },
    {
      rosterId: 3,
      name: "C",
      players: [
        p("QB", 5500),
        p("RB", 4000),
        p("RB", 3500),
        p("RB", 3200),
        p("WR", 1500),
        p("WR", 1000),
        p("WR", 800),
        p("TE", 6000),
        p("TE", 4500),
        p("TE", 3000),
      ],
    },
    {
      rosterId: 4,
      name: "D",
      players: [
        p("QB", 4000),
        p("RB", 3800),
        p("RB", 3600),
        p("RB", 2000),
        p("WR", 3000),
        p("WR", 2800),
        p("WR", 2600),
        p("TE", 2000),
        p("TE", 1500),
      ],
    },
  ];
  return { teams, star };
}
