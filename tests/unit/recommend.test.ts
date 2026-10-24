import { describe, expect, it } from "vitest";

import { recommendNextAction } from "@/lib/recommend";

const today = "2026-10-24";
type Data = Parameters<typeof recommendNextAction>[0];

function task(over: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(), title: "Task", status: "next", priority: "medium", due_date: null,
    project_milestone_id: null, ...over,
  } as unknown as Data["tasks"][number];
}

function data(over: Partial<{ [K in keyof Data]: unknown }> = {}): Data {
  return {
    project: { status: "active" },
    tasks: [],
    milestones: [],
    blockers: [],
    ...over,
  } as unknown as Data;
}

describe("recommendNextAction", () => {
  it("asks for a first task when there are none", () => {
    expect(recommendNextAction(data(), today).title).toBe("Define the first concrete task");
  });
  it("prioritises an open blocker over everything", () => {
    const r = recommendNextAction(
      data({
        blockers: [{ description: "Waiting for budget approval", resolved_at: null, task_id: null }],
        tasks: [task({ title: "Overdue thing", due_date: "2026-10-01" })],
      }),
      today,
    );
    expect(r.title).toBe("Unblock: Waiting for budget approval");
  });
  it("then the most urgent overdue task", () => {
    const r = recommendNextAction(
      data({
        tasks: [
          task({ title: "Low overdue", due_date: "2026-10-01", priority: "low" }),
          task({ title: "Critical overdue", due_date: "2026-10-20", priority: "critical" }),
          task({ title: "In progress", status: "in_progress" }),
        ],
      }),
      today,
    );
    expect(r.title).toBe("Critical overdue");
  });
  it("prefers finishing in-progress work over starting new work", () => {
    const r = recommendNextAction(
      data({ tasks: [task({ title: "New", priority: "critical" }), task({ title: "Half done", status: "in_progress" })] }),
      today,
    );
    expect(r.title).toBe("Half done");
  });
  it("flags a next milestone with no tasks attached", () => {
    const r = recommendNextAction(
      data({ milestones: [{ id: "m1", title: "Beta", completed_at: null }], tasks: [task({ title: "Unrelated" })] }),
      today,
    );
    expect(r.title).toBe('Plan the tasks for "Beta"');
  });
  it("says nothing to do for closed projects", () => {
    expect(recommendNextAction(data({ project: { status: "completed" } }), today).title).toMatch(/closed/);
  });
  it("suggests wrapping up when all tasks are finished", () => {
    const r = recommendNextAction(data({ tasks: [task({ status: "done" }), task({ status: "cancelled" })] }), today);
    expect(r.title).toMatch(/Wrap up/);
  });
});
