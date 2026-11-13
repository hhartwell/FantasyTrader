const KEY = "fantasytrader.visitor";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Records this browser once. The server counts it once per UTC day. */
export function recordVisit(): void {
  let visitorId: string;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && ID.test(existing)) {
      visitorId = existing;
    } else {
      visitorId = crypto.randomUUID();
      localStorage.setItem(KEY, visitorId);
    }
  } catch {
    return;
  }
  void fetch("/api/visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId }),
    keepalive: true,
  }).catch(() => {});
}
