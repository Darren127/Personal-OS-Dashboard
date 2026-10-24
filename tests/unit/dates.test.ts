import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  formatRelativeDate,
  todayIn,
  utcIsoToZonedLocal,
  zonedLocalToUtcIso,
} from "@/lib/dates";

describe("timezone conversion", () => {
  it.each([
    ["2026-10-24T09:30", "Asia/Singapore", "2026-10-24T01:30:00.000Z"],
    ["2026-07-01T09:00", "America/New_York", "2026-07-01T13:00:00.000Z"], // summer time
    ["2026-12-01T09:00", "America/New_York", "2026-12-01T14:00:00.000Z"], // winter time
    ["2026-03-29T03:30", "Europe/London", "2026-03-29T02:30:00.000Z"], // day clocks go forward
    ["2026-10-24T00:15", "UTC", "2026-10-24T00:15:00.000Z"],
  ])("%s in %s ⇄ %s", (local, tz, utc) => {
    expect(zonedLocalToUtcIso(local, tz)).toBe(utc);
    expect(utcIsoToZonedLocal(utc, tz)).toBe(local);
  });
});

describe("todayIn", () => {
  const instant = new Date("2026-10-24T20:00:00Z");
  it("uses the user's timezone, not the server's", () => {
    expect(todayIn("UTC", instant)).toBe("2026-10-24");
    expect(todayIn("Asia/Singapore", instant)).toBe("2026-10-25");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-24");
  });
  it("falls back to UTC for an invalid timezone", () => {
    expect(todayIn("Not/AZone", instant)).toBe("2026-10-24");
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2026-10-24", "2026-10-31")).toBe(7);
    expect(daysBetween("2026-10-24", "2026-10-20")).toBe(-4);
  });
  it("formats relative dates", () => {
    const today = "2026-10-24";
    expect(formatRelativeDate("2026-10-24", today)).toBe("Today");
    expect(formatRelativeDate("2026-10-25", today)).toBe("Tomorrow");
    expect(formatRelativeDate("2026-10-23", today)).toBe("Yesterday");
    expect(formatRelativeDate("2026-10-20", today)).toBe("4 days ago");
    expect(formatRelativeDate("2027-02-01", today)).toBe("1 Feb 2027");
  });
});
