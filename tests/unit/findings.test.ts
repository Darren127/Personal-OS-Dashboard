import { describe, expect, it } from "vitest";

import { detectFindings, planOverloadAdjustment, type DetectorInput, type DetectorTask } from "@/lib/findings";

const today = "2026-10-25";

function task(id: string, over: Partial<DetectorTask> = {}): DetectorTask {
  return { id, title: `Task ${id}`, status: "next", priority: "medium", due_date: null, estimated_minutes: null, reschedule_count: 0, ...over };
}

function input(over: Partial<DetectorInput> = {}): DetectorInput {
  return {
    today, availableMinutes: 480, openTasks: [], todayTaskIds: [], todayPriorityIds: [],
    recentPlans: [], recentReviewDates: [], goals: [], blockers: [], ...over,
  };
}

const types = (i: DetectorInput) => detectFindings(i).map((f) => f.type);

describe("planOverloadAdjustment", () => {
  it("moves the lowest-priority, largest tasks first until the day fits", () => {
    const tasks = [
      task("a", { priority: "high", estimated_minutes: 240 }),
      task("b", { priority: "low", estimated_minutes: 60 }),
      task("c", { priority: "low", estimated_minutes: 120 }),
      task("d", { priority: "medium", estimated_minutes: 180 }),
    ];
    const r = planOverloadAdjustment(tasks, 420, []);
    expect(r.totalMinutes).toBe(600);
    expect(r.move.map((t) => t.id)).toEqual(["c", "b"]);
    expect(r.remainingMinutes).toBe(420);
    expect(r.stillOver).toBe(false);
  });

  it("never moves top priorities, in-progress, or critical tasks", () => {
    const tasks = [
      task("p", { priority: "low", estimated_minutes: 300 }),
      task("w", { status: "in_progress", priority: "low", estimated_minutes: 200 }),
      task("c", { priority: "critical", estimated_minutes: 200 }),
    ];
    const r = planOverloadAdjustment(tasks, 100, ["p"]);
    expect(r.move).toEqual([]);
    expect(r.stillOver).toBe(true);
  });

  it("does nothing when the day already fits", () => {
    expect(planOverloadAdjustment([task("a", { estimated_minutes: 60 })], 480, []).move).toEqual([]);
  });
});

describe("detectFindings", () => {
  it("finds nothing in a healthy, empty week", () => {
    expect(detectFindings(input())).toEqual([]);
  });

  it("flags an overloaded day with a concrete move-to-tomorrow action", () => {
    const openTasks = [task("a", { priority: "high", estimated_minutes: 300 }), task("b", { priority: "low", estimated_minutes: 240 })];
    const [f] = detectFindings(input({ openTasks, todayTaskIds: ["a", "b"], todayPriorityIds: ["a"], availableMinutes: 480 }));
    expect(f.type).toBe("overload");
    expect(f.severity).toBe("alert");
    expect(f.title).toBe("Today is 1h over capacity");
    expect(f.actions[0]).toEqual({ kind: "reschedule_tasks", label: "Move 1 task to tomorrow", taskIds: ["b"], dueDate: "2026-10-26" });
  });

  it("groups tasks overdue by 2+ days, oldest first, and ignores yesterday's", () => {
    const openTasks = [
      task("y", { due_date: "2026-10-24" }),
      task("o", { due_date: "2026-10-15", title: "Old one" }),
      task("n", { due_date: "2026-10-22", title: "Newer" }),
    ];
    const f = detectFindings(input({ openTasks })).find((x) => x.type === "overdue")!;
    expect(f.title).toBe("2 tasks overdue by two days or more");
    expect(f.evidence).toMatch(/^"Old one" \(10 days\), "Newer" \(3 days\)/);
    expect(f.severity).toBe("warning"); // 10 days old
  });

  it("flags tasks pushed back 3+ times, more seriously at 5+", () => {
    const fs = detectFindings(input({ openTasks: [task("a", { reschedule_count: 2 }), task("b", { reschedule_count: 3 }), task("c", { reschedule_count: 6 })] }));
    const r = fs.filter((f) => f.type === "repeated_reschedule");
    expect(r.map((f) => [f.key, f.severity])).toEqual([["reschedule:c:6", "warning"], ["reschedule:b:3", "info"]]);
    expect(r[1].actions.map((a) => a.kind)).toEqual(["ask_ai", "cancel_task"]);
  });

  it("only treats repeated misses as a pattern (one miss is not a pattern)", () => {
    const plans = (outcomes: string[]) =>
      outcomes.map((o, i) => ({ plan_date: `2026-10-${String(20 + i).padStart(2, "0")}`, items: [{ task_id: "a", priority_rank: 1, outcome: o }] }));
    const openTasks = [task("a")];
    expect(types(input({ openTasks, recentPlans: plans(["skipped"]) }))).not.toContain("failed_priority");
    expect(types(input({ openTasks, recentPlans: plans(["skipped", "moved"]) }))).toContain("failed_priority");
    // Not flagged once the task is done (no longer open).
    expect(types(input({ openTasks: [], recentPlans: plans(["skipped", "moved", "skipped"]) }))).not.toContain("failed_priority");
  });

  it("flags a low top-priority completion rate only with enough data", () => {
    const item = (o: string, id: string) => ({ task_id: id, priority_rank: 1, outcome: o });
    const few = [{ plan_date: "2026-10-20", items: [item("skipped", "x"), item("skipped", "y")] }];
    expect(types(input({ recentPlans: few }))).not.toContain("priority_rate");
    const many = [
      { plan_date: "2026-10-20", items: [item("skipped", "x"), item("done", "y"), item("skipped", "z")] },
      { plan_date: "2026-10-21", items: [item("moved", "x2"), item("skipped", "y2"), item("partial", "z2")] },
    ];
    const f = detectFindings(input({ recentPlans: many })).find((x) => x.type === "priority_rate")!;
    expect(f.title).toBe("Only 1 of 6 top priorities got done in the last two weeks");
  });

  it("flags stalled goals but gives new goals two weeks", () => {
    const goals = [
      { id: "g1", title: "Old stalled", created_at: "2026-09-01T00:00:00Z", recentlyActive: false },
      { id: "g2", title: "Old active", created_at: "2026-09-01T00:00:00Z", recentlyActive: true },
      { id: "g3", title: "Brand new", created_at: "2026-10-20T00:00:00Z", recentlyActive: false },
    ];
    expect(detectFindings(input({ goals })).filter((f) => f.type === "goal_stall").map((f) => f.title)).toEqual(['No progress on "Old stalled" in two weeks']);
  });

  it("flags project blockers older than a week", () => {
    const blockers = [
      { projectId: "p1", projectName: "Launch", description: "Waiting on legal", created_at: "2026-10-10T09:00:00Z" },
      { projectId: "p2", projectName: "Fresh", description: "Waiting on X", created_at: "2026-10-23T09:00:00Z" },
    ];
    const f = detectFindings(input({ blockers })).filter((x) => x.type === "blocked_project");
    expect(f.map((x) => [x.title, x.severity])).toEqual([["Launch has been blocked for 15 days", "warning"]]);
  });

  it("notices planning without reviewing", () => {
    const recentPlans = ["2026-10-20", "2026-10-21", "2026-10-22"].map((d) => ({ plan_date: d, items: [{ task_id: "t", priority_rank: null, outcome: null }] }));
    expect(types(input({ recentPlans, recentReviewDates: ["2026-10-21"] }))).toContain("missing_reviews");
    expect(types(input({ recentPlans, recentReviewDates: ["2026-10-21", "2026-10-22"] }))).not.toContain("missing_reviews");
  });

  it("sorts alerts before warnings before info", () => {
    const fs = detectFindings(input({
      openTasks: [task("a", { reschedule_count: 3 }), task("b", { estimated_minutes: 600, priority: "low" })],
      todayTaskIds: ["b"],
    }));
    expect(fs.map((f) => f.severity)).toEqual(["alert", "info"]);
  });
});
