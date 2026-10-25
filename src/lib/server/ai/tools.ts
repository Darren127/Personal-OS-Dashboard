import "server-only";

import { z } from "zod";

import { addDays, weekStartOf } from "@/lib/dates";
import {
  GOAL_HORIZONS,
  GOAL_STATUSES,
  OPEN_TASK_STATUSES,
  PRIORITIES,
  TASK_STATUSES,
} from "@/lib/domain";
import { recommendNextAction } from "@/lib/recommend";
import { describeProgress } from "@/lib/server/goals";
import { getBehaviorInsights } from "@/lib/server/insights";
import { ensurePlan, saveReviewWithOutcomes } from "@/lib/server/plans";
import { describeProjectProgress } from "@/lib/server/projects";
import { TASK_SELECT } from "@/lib/server/tasks";
import { upsertWeeklyReview } from "@/lib/server/weekly";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];

/**
 * The Companion's tools. Every input is validated with Zod before anything
 * runs; every tool runs through the user's own Supabase session, so Row Level
 * Security applies exactly as it does to the rest of the app.
 *
 * Risk levels:
 * - read:   looks things up; always allowed, not logged as an action.
 * - memory: creates a *proposed* memory the user must review; always allowed.
 * - low:    small reversible change; runs immediately only if the user enabled
 *           auto-execution in Settings, otherwise waits for approval.
 * - high:   destructive or major change; always waits for approval.
 */
export type Risk = "read" | "memory" | "low" | "high";

export type ToolContext = {
  supabase: Db;
  today: string;
  timezone: string;
  weekStartsOn: number;
  conversationId: string | null;
};

export type ToolOutcome =
  | { ok: true; result: Record<string, unknown>; entity?: { type: string; id: string }; before?: unknown }
  | { ok: false; error: string };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  risk: Risk | ((input: z.infer<S>, ctx: ToolContext) => Promise<Risk>);
  /** One-line, human-readable description of what this call does. */
  summarize: (input: z.infer<S>, ctx: ToolContext) => Promise<string> | string;
  execute: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDef<any>;

function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

const id = z.uuid();
const date = z.iso.date();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

function fail(message: string): ToolOutcome {
  return { ok: false, error: message };
}

async function taskTitle(supabase: Db, taskId: string) {
  const { data } = await supabase.from("tasks").select("title").eq("id", taskId).maybeSingle();
  return data?.title ? `"${data.title}"` : "a task";
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

const searchTasks = tool({
  name: "search_tasks",
  description:
    "Find the user's tasks. Call this whenever you need tasks beyond the context note (e.g. by project, goal, tag, title words, done tasks, or tasks without due dates) before making claims about them.",
  schema: z.object({
    query: z.string().max(200).optional().describe("Words to match in task titles"),
    status: z.enum([...TASK_STATUSES, "open", "all"]).default("open").describe("'open' = not done or cancelled"),
    due: z.enum(["overdue", "today", "week", "none", "any"]).default("any"),
    project_id: id.optional(),
    goal_id: id.optional(),
    tag: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  risk: "read",
  summarize: (i) => `Looked up tasks${i.query ? ` matching "${i.query}"` : ""}${i.due !== "any" ? ` (${i.due})` : ""}`,
  async execute(i, { supabase, today }) {
    let q = supabase.from("tasks")
      .select("id, title, status, priority, due_date, estimated_minutes, actual_minutes, reschedule_count, tags, completed_at, project:projects(name), goal:goals!tasks_goal_id_user_id_fkey(title)");
    if (i.status === "open") q = q.in("status", OPEN_TASK_STATUSES);
    else if (i.status !== "all") q = q.eq("status", i.status);
    if (i.query) q = q.ilike("title", `%${escapeLike(i.query)}%`);
    if (i.project_id) q = q.eq("project_id", i.project_id);
    if (i.goal_id) q = q.eq("goal_id", i.goal_id);
    if (i.tag) q = q.contains("tags", [i.tag]);
    if (i.due === "overdue") q = q.lt("due_date", today).in("status", OPEN_TASK_STATUSES);
    if (i.due === "today") q = q.eq("due_date", today);
    if (i.due === "week") q = q.gte("due_date", today).lte("due_date", addDays(today, 7));
    if (i.due === "none") q = q.is("due_date", null);
    const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(i.limit);
    if (error) return fail(error.message);
    return { ok: true, result: { count: data.length, tasks: data } };
  },
});

const getGoalDetails = tool({
  name: "get_goal_details",
  description: "Get one goal in full: why it matters, success criteria, measured progress, milestones, linked tasks and projects, and recent review notes. Call before advising on or changing a specific goal.",
  schema: z.object({ goal_id: id }),
  risk: "read",
  summarize: () => "Looked up a goal's details",
  async execute({ goal_id }, { supabase }) {
    const goal = await supabase.from("goals").select("*").eq("id", goal_id).maybeSingle();
    if (goal.error) return fail(goal.error.message);
    if (!goal.data) return fail("No goal with that ID.");
    const [progress, milestones, tasks, projects, reviews] = await Promise.all([
      supabase.from("goal_progress").select("*").eq("goal_id", goal_id).maybeSingle(),
      supabase.from("goal_milestones").select("id, title, due_date, completed_at").eq("goal_id", goal_id).order("position"),
      supabase.from("tasks").select("id, title, status, priority, due_date, reschedule_count").eq("goal_id", goal_id).limit(50),
      supabase.from("project_goals").select("project:projects(id, name, status)").eq("goal_id", goal_id),
      supabase.from("goal_reviews").select("review_date, notes, progress_snapshot").eq("goal_id", goal_id)
        .order("review_date", { ascending: false }).limit(5),
    ]);
    return {
      ok: true,
      result: {
        goal: goal.data,
        progress: describeProgress(goal.data, progress.data ?? undefined),
        milestones: milestones.data,
        tasks: tasks.data,
        projects: projects.data?.map((p) => p.project),
        recent_review_notes: reviews.data,
      },
    };
  },
});

const getProjectDetails = tool({
  name: "get_project_details",
  description: "Get one project in full: objective, progress, milestones, tasks (incl. overdue), blockers, linked goals, notes, review history, and the rule-based next action. Call before advising on a specific project.",
  schema: z.object({ project_id: id }),
  risk: "read",
  summarize: () => "Looked up a project's details",
  async execute({ project_id }, { supabase, today }) {
    const project = await supabase.from("projects").select("*").eq("id", project_id).maybeSingle();
    if (project.error) return fail(project.error.message);
    if (!project.data) return fail("No project with that ID.");
    const [progress, milestones, tasks, goals, blockers, reviews] = await Promise.all([
      supabase.from("project_progress").select("*").eq("project_id", project_id).maybeSingle(),
      supabase.from("project_milestones").select("*").eq("project_id", project_id).order("position"),
      supabase.from("tasks").select(TASK_SELECT).eq("project_id", project_id).limit(100),
      supabase.from("project_goals").select("goal:goals(id, title, status)").eq("project_id", project_id),
      supabase.from("project_blockers").select("id, description, resolved_at, task_id").eq("project_id", project_id),
      supabase.from("project_reviews").select("review_date, notes, progress_snapshot").eq("project_id", project_id)
        .order("review_date", { ascending: false }).limit(5),
    ]);
    const rec = recommendNextAction(
      { project: project.data, tasks: tasks.data ?? [], milestones: milestones.data ?? [], blockers: (blockers.data ?? []) as never },
      today,
    );
    return {
      ok: true,
      result: {
        project: project.data,
        progress: describeProjectProgress(progress.data),
        milestones: milestones.data?.map((m) => ({ id: m.id, title: m.title, due_date: m.due_date, done: Boolean(m.completed_at) })),
        tasks: tasks.data?.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, reschedule_count: t.reschedule_count })),
        blockers: blockers.data,
        goals: goals.data?.map((g) => g.goal),
        recent_reviews: reviews.data,
        rule_based_next_action: rec,
      },
    };
  },
});

const getReviews = tool({
  name: "get_reviews",
  description: "Get the user's daily reviews and how each planned day turned out (done / partial / moved / skipped) for the last N days. Call for weekly or monthly reviews and when discussing how recent days went.",
  schema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
  risk: "read",
  summarize: (i) => `Read daily reviews from the last ${i.days} days`,
  async execute({ days }, { supabase, today }) {
    const from = addDays(today, -days);
    const [reviews, plans] = await Promise.all([
      supabase.from("daily_reviews").select("review_date, wins, challenges, lessons, tomorrow_focus, energy, mood")
        .gte("review_date", from).order("review_date"),
      supabase.from("daily_plans").select("plan_date, intention, items:daily_plan_items(priority_rank, outcome, task:tasks(title))")
        .gte("plan_date", from).order("plan_date"),
    ]);
    if (reviews.error) return fail(reviews.error.message);
    if (plans.error) return fail(plans.error.message);
    return {
      ok: true,
      result: {
        reviews: reviews.data,
        plans: plans.data.map((p) => ({
          date: p.plan_date,
          intention: p.intention,
          planned: p.items.filter((i) => i.task).map((i) => ({ task: i.task!.title, top_priority: i.priority_rank, outcome: i.outcome ?? "not reviewed" })),
        })),
      },
    };
  },
});

const getBehaviorInsightsTool = tool({
  name: "get_behavior_insights",
  description: "Get computed statistics about the user's behaviour over the last N days: tasks created vs completed, repeatedly rescheduled tasks, planned-day outcomes, top-priority completion, estimate accuracy, review mood/energy and challenges, and goals with no recent progress. Call this before discussing procrastination, patterns, overcommitment, or whether behaviour matches stated goals.",
  schema: z.object({ days: z.number().int().min(7).max(90).default(14) }),
  risk: "read",
  summarize: (i) => `Analysed behaviour over the last ${i.days} days`,
  async execute({ days }, { supabase, today, timezone }) {
    return { ok: true, result: await getBehaviorInsights(supabase, today, timezone, days) };
  },
});

const searchMemories = tool({
  name: "search_memories",
  description: "Search the user's saved memories (preferences, working style, obstacles, decisions, lessons, observations) beyond those in the context note.",
  schema: z.object({ query: z.string().min(1).max(200) }),
  risk: "read",
  summarize: (i) => `Searched memories for "${i.query}"`,
  async execute({ query }, { supabase }) {
    const terms = query.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    if (!terms.length) return { ok: true, result: { memories: [] } };
    const { data, error } = await supabase.from("memories")
      .select("category, content, confidence, evidence_count, status, created_at")
      .in("status", ["approved", "proposed"])
      .textSearch("search", terms.join(" or "), { type: "websearch", config: "english" })
      .limit(20);
    if (error) return fail(error.message);
    return { ok: true, result: { memories: data } };
  },
});

const searchPastConversations = tool({
  name: "search_past_conversations",
  description: "Search earlier conversations with the user for something they said before. Call when they refer to a previous discussion or when past context would change your advice.",
  schema: z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) }),
  risk: "read",
  summarize: (i) => `Searched past conversations for "${i.query}"`,
  async execute({ query, limit }, { supabase, conversationId }) {
    const terms = query.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    if (!terms.length) return { ok: true, result: { matches: [] } };
    let q = supabase.from("conversation_messages")
      .select("role, text_content, created_at, conversation:conversations(title)")
      .eq("visible", true)
      .textSearch("search", terms.join(" or "), { type: "websearch", config: "english" });
    if (conversationId) q = q.neq("conversation_id", conversationId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) return fail(error.message);
    return {
      ok: true,
      result: {
        matches: data.map((m) => ({
          conversation: m.conversation?.title, date: m.created_at.slice(0, 10), role: m.role, text: m.text_content.slice(0, 600),
        })),
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

const createTask = tool({
  name: "create_task",
  description: "Create a new task. Call when the user asks for a task, or agrees to one you suggested. Make it a concrete next action with a clear finish line.",
  schema: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).optional(),
    status: z.enum(["inbox", "next", "in_progress", "waiting"]).default("next"),
    priority: z.enum(PRIORITIES).default("medium"),
    due_date: date.optional(),
    estimated_minutes: z.number().int().min(1).max(10080).optional(),
    project_id: id.optional(),
    goal_id: id.optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  }),
  risk: "low",
  summarize: (i) => `Create task "${i.title}"${i.due_date ? ` due ${i.due_date}` : ""}`,
  async execute(i, { supabase }) {
    const { data, error } = await supabase.from("tasks").insert({
      title: i.title,
      description: i.description ?? null,
      status: i.status,
      priority: i.priority,
      due_date: i.due_date ?? null,
      estimated_minutes: i.estimated_minutes ?? null,
      project_id: i.project_id ?? null,
      goal_id: i.goal_id ?? null,
      tags: (i.tags ?? []).map((t) => t.toLowerCase().replace(/\s+/g, "-")),
    }).select("id, title").single();
    if (error) return fail(error.code === "23503" ? "The project or goal ID doesn't exist." : error.message);
    return { ok: true, result: { task_id: data.id, title: data.title }, entity: { type: "task", id: data.id } };
  },
});

/** Shared shape for single-task updates that record the previous state. */
async function updateTask(supabase: Db, taskId: string, patch: Tables["tasks"]["Update"]): Promise<ToolOutcome> {
  const before = await supabase.from("tasks").select("id, title, status, priority, due_date, project_id, goal_id").eq("id", taskId).maybeSingle();
  if (before.error) return fail(before.error.message);
  if (!before.data) return fail("No task with that ID.");
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", taskId)
    .select("id, title, status, priority, due_date, project_id, goal_id").single();
  if (error) return fail(error.code === "23503" ? "The project or goal ID doesn't exist." : error.message);
  return { ok: true, result: { task: data }, entity: { type: "task", id: taskId }, before: before.data };
}

const updateTaskStatus = tool({
  name: "update_task_status",
  description: "Change a task's status (e.g. mark done, start, wait, or cancel). Call when the user reports progress or agrees to drop a task.",
  schema: z.object({ task_id: id, status: z.enum(TASK_STATUSES) }),
  risk: "low",
  summarize: async (i, { supabase }) => `Mark ${await taskTitle(supabase, i.task_id)} as ${i.status.replace("_", " ")}`,
  execute: (i, { supabase }) => updateTask(supabase, i.task_id, { status: i.status }),
});

const updateTaskPriority = tool({
  name: "update_task_priority",
  description: "Change a task's priority.",
  schema: z.object({ task_id: id, priority: z.enum(PRIORITIES) }),
  risk: "low",
  summarize: async (i, { supabase }) => `Set ${await taskTitle(supabase, i.task_id)} to ${i.priority} priority`,
  execute: (i, { supabase }) => updateTask(supabase, i.task_id, { priority: i.priority }),
});

const rescheduleTask = tool({
  name: "reschedule_task",
  description: "Change a task's due date (or clear it with null). Pushing a date later is counted as a reschedule, so only do it with a realistic new date and a reason.",
  schema: z.object({ task_id: id, due_date: date.nullable(), reason: z.string().min(1).max(300) }),
  risk: "low",
  summarize: async (i, { supabase }) =>
    `${i.due_date ? `Move ${await taskTitle(supabase, i.task_id)} to ${i.due_date}` : `Clear the due date of ${await taskTitle(supabase, i.task_id)}`} — ${i.reason}`,
  execute: (i, { supabase }) => updateTask(supabase, i.task_id, { due_date: i.due_date }),
});

const linkTask = tool({
  name: "link_task",
  description: "Link a task to a project and/or goal, or unlink it (null). Omit a field to leave it unchanged.",
  schema: z.object({
    task_id: id,
    project_id: id.nullable().optional(),
    goal_id: id.nullable().optional(),
  }).refine((v) => v.project_id !== undefined || v.goal_id !== undefined, "Provide project_id and/or goal_id."),
  risk: "low",
  summarize: async (i, { supabase }) => `Change the project/goal links of ${await taskTitle(supabase, i.task_id)}`,
  execute: (i, { supabase }) => {
    const patch: Tables["tasks"]["Update"] = {};
    if (i.project_id !== undefined) patch.project_id = i.project_id;
    if (i.goal_id !== undefined) patch.goal_id = i.goal_id;
    return updateTask(supabase, i.task_id, patch);
  },
});

const addMilestone = tool({
  name: "add_milestone",
  description: "Add a milestone to a goal or project. Use to break a large goal or project into checkpoints that can clearly be called done.",
  schema: z.object({
    parent_type: z.enum(["goal", "project"]),
    parent_id: id,
    title: z.string().trim().min(1).max(200),
    due_date: date.optional(),
  }),
  risk: "low",
  summarize: (i) => `Add ${i.parent_type} milestone "${i.title}"${i.due_date ? ` due ${i.due_date}` : ""}`,
  async execute(i, { supabase }) {
    const table = i.parent_type === "goal" ? "goal_milestones" : "project_milestones";
    const last = i.parent_type === "goal"
      ? await supabase.from("goal_milestones").select("position").eq("goal_id", i.parent_id).order("position", { ascending: false }).limit(1).maybeSingle()
      : await supabase.from("project_milestones").select("position").eq("project_id", i.parent_id).order("position", { ascending: false }).limit(1).maybeSingle();
    const position = (last.data?.position ?? -1) + 1;
    const base = { title: i.title, due_date: i.due_date ?? null, position };
    const res = i.parent_type === "goal"
      ? await supabase.from("goal_milestones").insert({ ...base, goal_id: i.parent_id }).select("id").single()
      : await supabase.from("project_milestones").insert({ ...base, project_id: i.parent_id }).select("id").single();
    if (res.error) return fail(res.error.code === "23503" ? `No ${i.parent_type} with that ID.` : res.error.message);
    return { ok: true, result: { milestone_id: res.data.id, title: i.title }, entity: { type: table, id: res.data.id } };
  },
});

const draftSchedule = tool({
  name: "draft_schedule",
  description:
    "Propose a revised plan for today: up to three top priorities and/or time blocks. The user sees it and must approve it; approving replaces today's priorities (if given) and time blocks. Check the time blocks fit the working hours and the tasks' estimates first.",
  schema: z.object({
    priorities: z.array(id).max(3).optional().describe("Task IDs, most important first"),
    blocks: z.array(z.object({
      task_id: id.optional(),
      title: z.string().max(200).optional().describe("For non-task blocks such as lunch"),
      start: hhmm,
      end: hhmm,
    }).refine((b) => b.task_id || b.title, "Each block needs a task_id or a title")
      .refine((b) => b.end > b.start, "Each block must end after it starts")).max(20).optional(),
    rationale: z.string().min(1).max(1000),
  }).refine((v) => v.priorities?.length || v.blocks?.length, "Provide priorities and/or blocks."),
  risk: "high",
  summarize: (i) =>
    `Replace today's plan: ${[i.priorities?.length ? `${i.priorities.length} priorities` : null, i.blocks?.length ? `${i.blocks.length} time blocks` : null].filter(Boolean).join(", ")}`,
  async execute(i, { supabase, today }) {
    const plan = await ensurePlan(supabase, today);
    if (plan.error) return fail(plan.error.message);
    const before = await supabase.from("daily_plan_items").select("task_id, title, priority_rank, start_time, end_time").eq("plan_id", plan.id);
    if (before.error) return fail(before.error.message);

    // Remove what's being replaced.
    if (i.priorities?.length) {
      const r = await supabase.from("daily_plan_items").update({ priority_rank: null }).eq("plan_id", plan.id);
      if (r.error) return fail(r.error.message);
    }
    if (i.blocks?.length) {
      const r1 = await supabase.from("daily_plan_items").delete().eq("plan_id", plan.id).is("task_id", null);
      const r2 = await supabase.from("daily_plan_items").update({ start_time: null, end_time: null }).eq("plan_id", plan.id);
      if (r1.error || r2.error) return fail((r1.error ?? r2.error)!.message);
    }
    // Items with neither a rank nor a time block are no longer part of the plan.
    const r3 = await supabase.from("daily_plan_items").delete().eq("plan_id", plan.id).is("priority_rank", null).is("start_time", null);
    if (r3.error) return fail(r3.error.message);

    async function upsertTaskItem(taskId: string, patch: Tables["daily_plan_items"]["Update"]) {
      const existing = await supabase.from("daily_plan_items").select("id").eq("plan_id", plan.id!).eq("task_id", taskId).maybeSingle();
      return existing.data
        ? supabase.from("daily_plan_items").update(patch).eq("id", existing.data.id)
        : supabase.from("daily_plan_items").insert({ plan_id: plan.id!, task_id: taskId, ...patch });
    }
    for (const [idx, taskId] of (i.priorities ?? []).entries()) {
      const r = await upsertTaskItem(taskId, { priority_rank: idx + 1 });
      if (r.error) return fail(r.error.code === "23503" ? "A task in the plan doesn't exist." : r.error.message);
    }
    for (const b of i.blocks ?? []) {
      const r = b.task_id
        ? await upsertTaskItem(b.task_id, { start_time: b.start, end_time: b.end })
        : await supabase.from("daily_plan_items").insert({ plan_id: plan.id, title: b.title!, start_time: b.start, end_time: b.end });
      if (r.error) return fail(r.error.code === "23503" ? "A task in the plan doesn't exist." : r.error.message);
    }
    return { ok: true, result: { plan_date: today, priorities: i.priorities?.length ?? 0, blocks: i.blocks?.length ?? 0 }, entity: { type: "daily_plan", id: plan.id }, before: before.data };
  },
});

const recordDailyReview = tool({
  name: "record_daily_review",
  description: "Save today's end-of-day review from what the user told you. Only record what they actually said — never invent wins or feelings. Overwriting an existing review needs approval.",
  schema: z.object({
    wins: z.string().max(5000).optional(),
    challenges: z.string().max(5000).optional(),
    lessons: z.string().max(5000).optional(),
    tomorrow_focus: z.string().max(2000).optional(),
    energy: z.number().int().min(1).max(5).optional(),
    mood: z.number().int().min(1).max(5).optional(),
  }).refine((r) => Object.values(r).some((v) => v !== undefined && v !== ""), "Include at least one field."),
  async risk(_i, { supabase, today }) {
    const { data } = await supabase.from("daily_reviews").select("id").eq("review_date", today).maybeSingle();
    return data ? "high" : "low";
  },
  summarize: (_i, { today }) => `Save the daily review for ${today}`,
  async execute(i, { supabase, today }) {
    const before = await supabase.from("daily_reviews").select("*").eq("review_date", today).maybeSingle();
    const { error } = await saveReviewWithOutcomes(supabase, today, i);
    if (error) return fail(error.message);
    return { ok: true, result: { review_date: today, saved: true }, entity: { type: "daily_review", id: today }, before: before.data };
  },
});

const recordWeeklyReview = tool({
  name: "record_weekly_review",
  description:
    "Save a weekly review after discussing the week with the user. Put your honest summary in `summary` (what happened vs. what was planned, patterns, what to change). Only fill wins/challenges/lessons/next_week_focus with things the user said or agreed with. Defaults to the current week. Replacing text the user already wrote needs approval.",
  schema: z.object({
    week_start: date.optional().describe("First day of the week; omit for the current week"),
    summary: z.string().trim().min(1).max(10000),
    wins: z.string().max(5000).optional(),
    challenges: z.string().max(5000).optional(),
    lessons: z.string().max(5000).optional(),
    next_week_focus: z.string().max(2000).optional(),
  }),
  async risk(i, { supabase, today, weekStartsOn }) {
    const week = i.week_start ?? weekStartOf(today, weekStartsOn);
    const { data } = await supabase.from("weekly_reviews").select("wins, challenges, lessons, next_week_focus, ai_summary").eq("week_start", week).maybeSingle();
    const overwrites = data && (["wins", "challenges", "lessons", "next_week_focus"] as const).some((k) => i[k] && data[k]);
    return overwrites || data?.ai_summary ? "high" : "low";
  },
  summarize: (i, { today, weekStartsOn }) => `Save the weekly review for the week of ${i.week_start ?? weekStartOf(today, weekStartsOn)}`,
  async execute(i, { supabase, today, timezone, weekStartsOn }) {
    const week = i.week_start ?? weekStartOf(today, weekStartsOn);
    if (weekStartOf(week, weekStartsOn) !== week) return fail(`${week} isn't the first day of a week.`);
    if (week > today) return fail("That week hasn't started yet.");
    const before = await supabase.from("weekly_reviews").select("wins, challenges, lessons, next_week_focus, ai_summary").eq("week_start", week).maybeSingle();
    const fields: Record<string, string> = { ai_summary: i.summary };
    for (const k of ["wins", "challenges", "lessons", "next_week_focus"] as const) if (i[k]) fields[k] = i[k]!;
    const { data, error } = await upsertWeeklyReview(supabase, week, today, timezone, fields);
    if (error) return fail(error.message);
    return { ok: true, result: { week_start: week, saved: true }, entity: { type: "weekly_review", id: data.id }, before: before.data };
  },
});

const proposeMemory = tool({
  name: "propose_memory",
  description: "Propose a durable memory for the user to review (they approve, edit, or reject it on the Memory page). Use sparingly: stable preferences, working style, recurring obstacles with evidence, important decisions, lessons. Use confidence 'hypothesis' for anything inferred rather than stated.",
  schema: z.object({
    category: z.enum(["preference", "long_term_goal", "working_style", "recurring_obstacle", "decision", "lesson", "behavioural_observation"]),
    content: z.string().trim().min(1).max(500).describe("One clear sentence, written about the user"),
    confidence: z.enum(["confirmed", "hypothesis"]).describe("confirmed only if the user stated it directly"),
    evidence: z.string().min(1).max(500).describe("What this is based on"),
    importance: z.number().int().min(1).max(5).default(3),
  }),
  risk: "memory",
  summarize: (i) => `Propose memory: "${i.content}"`,
  async execute(i, { supabase, conversationId }) {
    const { data, error } = await supabase.from("memories").insert({
      category: i.category,
      content: i.content,
      confidence: i.confidence,
      importance: i.importance,
      status: "proposed",
      created_by: "ai",
      source_conversation_id: conversationId,
    }).select("id").single();
    if (error) return fail(error.message);
    return {
      ok: true,
      result: { memory_id: data.id, status: "pending_user_review", note: "Not saved yet: the user will approve, edit, or reject it." },
      entity: { type: "memory", id: data.id },
    };
  },
});

const updateGoal = tool({
  name: "update_goal",
  description: "Change a goal's title, status (e.g. achieved, on hold, abandoned), target date, horizon, why it matters, or success criteria. Major change: always needs the user's approval. Include a reason.",
  schema: z.object({
    goal_id: id,
    changes: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      status: z.enum(GOAL_STATUSES).optional(),
      target_date: date.nullable().optional(),
      horizon: z.enum(GOAL_HORIZONS).optional(),
      why_it_matters: z.string().max(5000).optional(),
      success_criteria: z.string().max(5000).optional(),
    }).refine((c) => Object.keys(c).length > 0, "Provide at least one change."),
    reason: z.string().min(1).max(500),
  }),
  risk: "high",
  async summarize(i, { supabase }) {
    const { data } = await supabase.from("goals").select("title").eq("id", i.goal_id).maybeSingle();
    return `Change goal "${data?.title ?? "?"}": ${Object.entries(i.changes).map(([k, v]) => `${k.replace(/_/g, " ")} → ${v ?? "none"}`).join(", ")}`;
  },
  async execute(i, { supabase }) {
    const before = await supabase.from("goals").select("id, title, status, target_date, horizon, why_it_matters, success_criteria, achieved_at").eq("id", i.goal_id).maybeSingle();
    if (before.error) return fail(before.error.message);
    if (!before.data) return fail("No goal with that ID.");
    const patch: Tables["goals"]["Update"] = { ...i.changes };
    if (i.changes.status) patch.achieved_at = i.changes.status === "achieved" ? (before.data.achieved_at ?? new Date().toISOString()) : null;
    const { data, error } = await supabase.from("goals").update(patch).eq("id", i.goal_id).select("id, title, status, target_date").single();
    if (error) return fail(error.message);
    return { ok: true, result: { goal: data }, entity: { type: "goal", id: i.goal_id }, before: before.data };
  },
});

const deleteTask = tool({
  name: "delete_task",
  description: "Permanently delete a task. Always needs approval. Prefer update_task_status 'cancelled', which keeps the history; delete only duplicates or mistakes.",
  schema: z.object({ task_id: id, reason: z.string().min(1).max(300) }),
  risk: "high",
  summarize: async (i, { supabase }) => `Delete ${await taskTitle(supabase, i.task_id)} — ${i.reason}`,
  async execute(i, { supabase }) {
    const before = await supabase.from("tasks").select("*").eq("id", i.task_id).maybeSingle();
    if (before.error) return fail(before.error.message);
    if (!before.data) return fail("No task with that ID.");
    const { error } = await supabase.from("tasks").delete().eq("id", i.task_id);
    if (error) return fail(error.message);
    return { ok: true, result: { deleted_task_id: i.task_id }, entity: { type: "task", id: i.task_id }, before: before.data };
  },
});

export const TOOLS: AnyTool[] = [
  searchTasks,
  getGoalDetails,
  getProjectDetails,
  getReviews,
  getBehaviorInsightsTool,
  searchMemories,
  searchPastConversations,
  createTask,
  updateTaskStatus,
  updateTaskPriority,
  rescheduleTask,
  linkTask,
  addMilestone,
  draftSchedule,
  recordDailyReview,
  recordWeeklyReview,
  proposeMemory,
  updateGoal,
  deleteTask,
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string) {
  return BY_NAME.get(name);
}

/**
 * Tool definitions for the API. Built once, in a fixed order, so the `tools`
 * array is byte-identical across requests (needed for caching and for the
 * model's reasoning to stay valid across turns).
 */
export const TOOL_DEFINITIONS = TOOLS.map((t) => {
  const { $schema: _ignored, ...input_schema } = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
  void _ignored;
  return {
    name: t.name,
    description: t.description,
    input_schema: input_schema as { type: "object"; [k: string]: unknown },
    // Stream tool inputs as generated; we validate every input ourselves.
    eager_input_streaming: true,
  };
});
