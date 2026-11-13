import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(here, "../../data");
export const VALUES_DIR = path.join(DATA_DIR, "values");
export const PLAYERS_FILE = path.join(DATA_DIR, "players", "nfl.json");
