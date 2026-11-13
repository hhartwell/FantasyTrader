import fs from "node:fs";
import path from "node:path";

const VISITOR_ID = /^[0-9a-zA-Z-]{8,80}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class VisitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisitError";
  }
}

export interface VisitDay {
  day: string;
  uniques: number;
}

export interface VisitReport {
  timezone: "UTC";
  today: string;
  days: VisitDay[];
}

export interface RecordResult {
  day: string;
  uniques: number;
  newVisitor: boolean;
}

interface VisitLog {
  days: Record<string, string[]>;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Anonymous browser ids, counted once per UTC day. */
export class VisitStore {
  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
    private readonly maxDays = 400,
  ) {}

  record(visitorId: string): RecordResult {
    if (!VISITOR_ID.test(visitorId)) {
      throw new VisitError("visitorId must be 8–80 letters, numbers, or hyphens");
    }
    const data = this.read();
    const day = dayKey(this.now());
    const ids = new Set(data.days[day] ?? []);
    const newVisitor = !ids.has(visitorId);
    if (newVisitor) {
      ids.add(visitorId);
      data.days[day] = [...ids];
      this.prune(data);
      this.write(data);
    }
    return { day, uniques: ids.size, newVisitor };
  }

  report(): VisitReport {
    const data = this.read();
    const today = dayKey(this.now());
    const days = Object.entries(data.days)
      .map(([day, ids]) => ({ day, uniques: ids.length }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    if (!days.some((d) => d.day === today)) days.unshift({ day: today, uniques: 0 });
    return { timezone: "UTC", today, days };
  }

  private prune(data: VisitLog) {
    const keys = Object.keys(data.days).sort();
    while (keys.length > this.maxDays) {
      const oldest = keys.shift();
      if (oldest) delete data.days[oldest];
    }
  }

  private read(): VisitLog {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return { days: {} };
    }
    if (!parsed || typeof parsed !== "object" || !("days" in parsed)) return { days: {} };
    const daysIn = (parsed as { days: unknown }).days;
    if (!daysIn || typeof daysIn !== "object") return { days: {} };
    const days: Record<string, string[]> = {};
    for (const [day, ids] of Object.entries(daysIn)) {
      if (!DAY.test(day) || !Array.isArray(ids)) continue;
      const unique = [
        ...new Set(ids.filter((id): id is string => typeof id === "string" && VISITOR_ID.test(id))),
      ];
      if (unique.length > 0) days[day] = unique;
    }
    return { days };
  }

  private write(data: VisitLog) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
  }
}
