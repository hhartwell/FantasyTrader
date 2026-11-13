import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  credentialsMatch,
  issueSession,
  readSession,
  type AdminConfig,
} from "../src/admin.js";
import { createApp } from "../src/app.js";
import { VisitStore } from "../src/visits.js";

const admin: AdminConfig = { username: "admin", password: "correct-horse", secret: "signing-key" };

describe("admin session", () => {
  it("accepts only the configured username and password", () => {
    expect(credentialsMatch(admin, "admin", "correct-horse")).toBe(true);
    expect(credentialsMatch(admin, "admin", "wrong")).toBe(false);
    expect(credentialsMatch(admin, "other", "correct-horse")).toBe(false);
  });

  it("round-trips a session and rejects tampering, expiry, and a password change", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    const token = issueSession(admin, now);
    expect(readSession(token, admin, now + 1000)).toBe("admin");
    expect(readSession(`${token}x`, admin, now + 1000)).toBeNull();
    expect(readSession(token, admin, now + 15 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(readSession(token, { ...admin, password: "new-password" }, now + 1000)).toBeNull();
  });
});

describe("admin routes", () => {
  it("keeps visit counts behind the admin session and still records public visits", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-admin-")), "visits.json");
    const app = createApp({ visits: new VisitStore(file), admin });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}`;
    try {
      const locked = await fetch(`${base}/api/admin/visits`);
      expect(locked.status).toBe(401);

      const denied = await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "nope" }),
      });
      expect(denied.status).toBe(401);

      const loggedIn = await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-horse" }),
      });
      expect(loggedIn.status).toBe(200);
      const cookie = loggedIn.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("HttpOnly");
      const header = cookie.split(";")[0];

      const recorded = await fetch(`${base}/api/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: "browser-aaaa" }),
      });
      expect(recorded.status).toBe(200);

      const report = await fetch(`${base}/api/admin/visits`, { headers: { cookie: header } });
      expect(report.status).toBe(200);
      const body = (await report.json()) as { days: { uniques: number }[] };
      expect(body.days[0].uniques).toBe(1);

      const gone = await fetch(`${base}/api/visits`);
      expect(gone.status).toBe(404);

      const loggedOut = await fetch(`${base}/api/admin/logout`, { method: "POST", headers: { cookie: header } });
      expect(loggedOut.status).toBe(200);
      const cleared = loggedOut.headers.get("set-cookie") ?? "";
      const after = await fetch(`${base}/api/admin/visits`, { headers: { cookie: cleared.split(";")[0] } });
      expect(after.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
