import { describe, expect, it } from "vitest";

import { formToObject } from "@/lib/actions";
import { goalInputSchema } from "@/lib/validation/goal";
import { timeBlockSchema } from "@/lib/validation/my-day";
import { projectInputSchema } from "@/lib/validation/project";
import { taskInputSchema } from "@/lib/validation/task";

describe("task validation", () => {
  it("requires only a title and applies defaults", () => {
    const r = taskInputSchema.parse({ title: "  Call mum  " });
    expect(r).toMatchObject({ title: "Call mum", status: "inbox", priority: "medium", tags: [] });
  });
  it("rejects a blank title", () => {
    expect(taskInputSchema.safeParse({ title: "   " }).success).toBe(false);
  });
  it("normalises tags: trims, lowercases, hyphenates, dedupes", () => {
    const r = taskInputSchema.parse({ title: "x", tags: " Deep Work, admin ,deep work,," });
    expect(r.tags).toEqual(["deep-work", "admin"]);
  });
  it("rejects a due date before the start date", () => {
    const r = taskInputSchema.safeParse({ title: "x", start_date: "2026-11-10", due_date: "2026-11-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["due_date"]);
  });
  it("rejects unknown statuses and malformed IDs", () => {
    expect(taskInputSchema.safeParse({ title: "x", status: "someday" }).success).toBe(false);
    expect(taskInputSchema.safeParse({ title: "x", project_id: "1; drop table" }).success).toBe(false);
  });
  it("coerces numeric fields from form strings", () => {
    expect(taskInputSchema.parse({ title: "x", estimated_minutes: "45" }).estimated_minutes).toBe(45);
    expect(taskInputSchema.safeParse({ title: "x", estimated_minutes: "0" }).success).toBe(false);
  });
});

describe("goal validation", () => {
  it("requires start, current and target for a metric goal", () => {
    const r = goalInputSchema.safeParse({ title: "Save", progress_method: "metric", metric_target: "100" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["metric_current", "metric_start"]);
  });
  it("rejects a metric whose target equals its start", () => {
    const r = goalInputSchema.safeParse({ title: "x", metric_start: "5", metric_target: "5", metric_current: "5" });
    expect(r.success).toBe(false);
  });
  it("requires an estimate for manual progress", () => {
    expect(goalInputSchema.safeParse({ title: "x", progress_method: "manual" }).success).toBe(false);
    expect(goalInputSchema.safeParse({ title: "x", progress_method: "manual", manual_progress: "40" }).success).toBe(true);
  });
});

describe("project and time-block validation", () => {
  it("rejects a deadline before the start date", () => {
    expect(projectInputSchema.safeParse({ name: "x", start_date: "2026-11-01", target_date: "2026-10-01" }).success).toBe(false);
  });
  it("requires a task or a title, and end after start", () => {
    expect(timeBlockSchema.safeParse({ start_time: "09:00", end_time: "10:00" }).success).toBe(false);
    expect(timeBlockSchema.safeParse({ title: "Lunch", start_time: "13:00", end_time: "12:00" }).success).toBe(false);
    expect(timeBlockSchema.safeParse({ title: "Lunch", start_time: "12:00", end_time: "13:00" }).success).toBe(true);
  });
});

describe("formToObject", () => {
  it("turns blank fields into undefined and keeps multi-value fields", () => {
    const fd = new FormData();
    fd.set("title", "x");
    fd.set("description", "   ");
    fd.append("tags", "a");
    fd.append("tags", "b");
    expect(formToObject(fd, ["tags"])).toEqual({ title: "x", description: undefined, tags: ["a", "b"] });
  });
});
