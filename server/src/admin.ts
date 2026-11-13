import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "ft_admin";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_AGE_S = MAX_AGE_MS / 1000;

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}

/** Null when `ADMIN_PASSWORD` is unset, which keeps the admin login closed. */
export function adminConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AdminConfig | null {
  const password = env.ADMIN_PASSWORD ?? "";
  if (!password) return null;
  return {
    username: env.ADMIN_USERNAME?.trim() || "admin",
    password,
    secret: env.ADMIN_SECRET?.trim() || password,
  };
}

function macEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function credentialsMatch(config: AdminConfig, username: string, password: string): boolean {
  return macEqual(username, config.username) && macEqual(password, config.password);
}

function passwordStamp(config: AdminConfig): string {
  return createHmac("sha256", config.secret).update(config.password).digest("base64url").slice(0, 16);
}

export function issueSession(config: AdminConfig, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ u: config.username, exp: now + MAX_AGE_MS, pw: passwordStamp(config) }),
  ).toString("base64url");
  const mac = createHmac("sha256", config.secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(token: string, config: AdminConfig, now = Date.now()): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", config.secret).update(body).digest("base64url");
  if (!macEqual(mac, expected)) return null;
  let parsed: { u?: unknown; exp?: unknown; pw?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; exp?: unknown; pw?: unknown };
  } catch {
    return null;
  }
  if (parsed.u !== config.username || parsed.pw !== passwordStamp(config)) return null;
  if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
  return config.username;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0 || trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`;
}

export function clearSessionCookie(): string {
  return `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
