import "server-only";

import { addDays, daysBetween, formatClockTime, formatLongDate, formatTime } from "@/lib/dates";
import { GOAL_CATEGORY_LABEL, GOAL_HORIZON_LABEL, OPEN_TASK_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/domain";
import { getFindings } from "@/lib/server/findings";
import { describeProgress } from "@/lib/server/goals";
import { describeProjectProgress } from "@/lib/server/projects";
import type { Db } from "@/lib/supabase/server";

const LIST_LIMIT = 15;
/** Below this many approved memories, include them all; above it, retrieve. */
const MEMORY_INCLUDE_ALL = 40;

type Prefs = { timezone: string; workDayStart: string; workDayEnd: string; displayName: string | null };

function words(text: string) {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])].slice(0, 12);
}

/** Approved memories relevant to this message (all of them while there are few). */
export async function retrieveMemories(supabase: Db, userText: string) {
  const all = await supabase.from("memories").select("id, category, content, confidence, evidence_count, importance")
    .eq("status", "approved").order("importance", { ascending: false }).limit(MEMORY_INCLUDE_ALL + 1);
  if (all.error) throw new Error(all.error.message);
  if (all.data.length <= MEMORY_INCLUDE_ALL) return all.data;

  const important = all.data.filter((m) => m.importance >= 4).slice(0, 10);
  const terms = words(userText);
  let matched: typeof all.data = [];
  if (terms.length) {
    const res = await supabase.from("memories").select("id, category, content, confidence, evidence_count, importance")
      .eq("status", "approved")
      .textSearch("search", terms.join(" or "), { type: "websearch", config: "english" })
      .limit(10);
    if (res.error) throw new Error(res.error.message);
    matched = res.data;
  }
  const seen = new Set<string>();
  return [...important, ...matched].filter((m) => !seen.has(m.id) && seen.add(m.id));
}

/**
 * The per-turn context note appended (as a system message) after each user
 * message: a compact snapshot of their data, with IDs the tools accept.
 */
export async function buildTurnContext(
  supabase: Db,
  opts: { today: string; now: Date; prefs: Prefs; conversationId: string | null; since: string | null; userText: string },
) {
  const { today, prefs } = opts;
  const week = addDays(today, 7);

  const [plan, dueToday, overdue, upcoming, goals, goalProgress, projects, projectProgress, review, pendingMemories, memories, actionUpdates, pendingActions, patterns] =
    await Promise.all([
      supabase.from("daily_plans").select("intention, items:daily_plan_items(priority_rank, start_time, end_time, title, task:tasks(id, title, status))")
        .eq("plan_date", today).maybeSingle(),
      supabase.from("tasks").select("id, title, status, priority, estimated_minutes, scheduled_start")
        .eq("due_date", today).neq("status", "cancelled").order("priority", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("tasks").select("id, title, priority, due_date, reschedule_count")
        .lt("due_date", today).in("status", OPEN_TASK_STATUSES).order("due_date").limit(LIST_LIMIT),
      supabase.from("tasks").select("id, title, priority, due_date")
        .gt("due_date", today).lte("due_date", week).in("status", OPEN_TASK_STATUSES).order("due_date").limit(LIST_LIMIT),
      supabase.from("goals").select("*").in("status", ["active", "not_started", "on_hold"])
        .order("target_date", { ascending: true, nullsFirst: false }).limit(LIST_LIMIT),
      supabase.from("goal_progress").select("*"),
      supabase.from("projects").select("id, name, status, priority, target_date").in("status", ["planning", "active", "on_hold"])
        .order("priority", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("project_progress").select("*"),
      supabase.from("daily_reviews").select("review_date, wins, challenges, lessons, tomorrow_focus, energy, mood")
        .lte("review_date", today).order("review_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("memories").select("category, content").eq("status", "proposed").limit(20),
      retrieveMemories(supabase, opts.userText),
      opts.conversationId && opts.since
        ? supabase.from("ai_action_logs").select("summary, status, error").eq("conversation_id", opts.conversationId)
            .gt("decided_at", opts.since).neq("status", "proposed")
        : Promise.resolve({ data: [], error: null }),
      supabase.from("ai_action_logs").select("id, summary").eq("status", "proposed")
        .order("created_at", { ascending: false }).limit(10),
      getFindings(supabase, today, prefs),
    ]);
  for (const r of [plan, dueToday, overdue, upcoming, goals, goalProgress, projects, projectProgress, review, pendingMemories, actionUpdates, pendingActions]) {
    if (r.error) throw new Error(`Failed to build context: ${r.error.message}`);
  }

  const L: string[] = [];
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: prefs.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(opts.now);
  L.push(`Now: ${formatLongDate(today)}, ${clock} (${prefs.timezone}). Working hours ${formatTime(prefs.workDayStart)}–${formatTime(prefs.workDayEnd)}.${prefs.displayName ? ` The user's name is ${prefs.displayName}.` : ""}`);

  const items = plan.data?.items ?? [];
  const priorities = items.filter((i) => i.priority_rank && i.task).sort((a, b) => a.priority_rank! - b.priority_rank!);
  const blocks = items.filter((i) => i.start_time).sort((a, b) => a.start_time!.localeCompare(b.start_time!));
  L.push("", "## Today's plan");
  if (plan.data?.intention) L.push(`Intention: ${plan.data.intention}`);
  L.push(priorities.length
    ? `Top priorities: ${priorities.map((p) => `#${p.priority_rank} ${p.task!.title} [${p.task!.id}] (${p.task!.status})`).join("; ")}`
    : "Top priorities: none set.");
  L.push(blocks.length
    ? `Time blocks: ${blocks.map((b) => `${formatTime(b.start_time!)}–${formatTime(b.end_time!)} ${b.task?.title ?? b.title}`).join("; ")}`
    : "Time blocks: none.");

  L.push("", `## Due today (${dueToday.data!.length})`);
  for (const t of dueToday.data!) {
    L.push(`- [${t.id}] ${t.title} · ${t.status} · ${t.priority}${t.estimated_minutes ? ` · est ${t.estimated_minutes}m` : ""}${t.scheduled_start ? ` · at ${formatClockTime(t.scheduled_start, prefs.timezone)}` : ""}`);
  }

  L.push("", `## Overdue (${overdue.data!.length}${overdue.data!.length === LIST_LIMIT ? "+" : ""})`);
  for (const t of overdue.data!) {
    L.push(`- [${t.id}] ${t.title} · ${t.priority} · due ${t.due_date} (${daysBetween(t.due_date!, today)}d ago)${t.reschedule_count ? ` · pushed later ${t.reschedule_count}x` : ""}`);
  }

  L.push("", `## Due in the next 7 days (${upcoming.data!.length})`);
  for (const t of upcoming.data!) L.push(`- [${t.id}] ${t.title} · ${t.priority} · due ${t.due_date}`);

  const gp = new Map(goalProgress.data!.map((p) => [p.goal_id, p]));
  L.push("", `## Current goals (${goals.data!.length})`);
  for (const g of goals.data!) {
    const p = describeProgress(g, gp.get(g.id));
    L.push(`- [${g.id}] ${g.title} · ${GOAL_CATEGORY_LABEL[g.category]}, ${GOAL_HORIZON_LABEL[g.horizon]}, ${g.status} · progress ${p.value === null ? "unmeasured" : `${p.value}%`} (${p.explanation})${g.target_date ? ` · target ${g.target_date}` : ""}`);
  }

  const pp = new Map(projectProgress.data!.map((p) => [p.project_id, p]));
  L.push("", `## Current projects (${projects.data!.length})`);
  for (const p of projects.data!) {
    const row = pp.get(p.id);
    const prog = describeProjectProgress(row);
    L.push(`- [${p.id}] ${p.name} · ${PROJECT_STATUS_LABEL[p.status]} · ${p.priority} · ${prog.value === null ? "no progress data" : `${prog.value}% (${prog.explanation})`}${row?.open_blockers ? ` · ${row.open_blockers} open blocker(s)` : ""}${row?.next_milestone_due ? ` · next milestone due ${row.next_milestone_due}` : ""}${p.target_date ? ` · deadline ${p.target_date}` : ""}`);
  }

  if (review.data) {
    const r = review.data;
    L.push("", `## Latest daily review (${r.review_date})`);
    for (const [k, v] of [["Wins", r.wins], ["Challenges", r.challenges], ["Lessons", r.lessons], ["Tomorrow", r.tomorrow_focus]] as const) {
      if (v) L.push(`${k}: ${v.slice(0, 400)}`);
    }
    if (r.energy || r.mood) L.push(`Energy ${r.energy ?? "–"}/5, mood ${r.mood ?? "–"}/5`);
  }

  if (patterns.findings.length) {
    L.push("", "## Patterns worth a look (computed from their data; the user sees these on My Day)");
    for (const f of patterns.findings.slice(0, 6)) L.push(`- [${f.severity}] ${f.title}. ${f.evidence}`);
  }

  L.push("", "## Saved memories");
  if (memories.length === 0) L.push("None yet.");
  for (const m of memories) {
    L.push(`- (${m.confidence}${m.confidence === "hypothesis" ? `, seen ${m.evidence_count}x` : ""}) [${m.category}] ${m.content}`);
  }
  if (pendingMemories.data!.length) {
    L.push(`Pending memory proposals awaiting the user's review (don't re-propose): ${pendingMemories.data!.map((m) => m.content).join(" | ")}`);
  }

  if (actionUpdates.data!.length) {
    L.push("", "## Updates on your earlier actions (since your last reply)");
    for (const a of actionUpdates.data!) {
      L.push(`- ${a.summary}: ${a.status === "executed" ? "approved by the user and completed" : a.status === "rejected" ? "rejected by the user" : a.status === "failed" ? `approved but failed (${a.error})` : a.status}`);
    }
  }
  if (pendingActions.data!.length) {
    L.push("", `## Actions still awaiting the user's approval: ${pendingActions.data!.map((a) => a.summary).join("; ")}`);
  }

  return `<context>\n${L.join("\n")}\n</context>`;
}
