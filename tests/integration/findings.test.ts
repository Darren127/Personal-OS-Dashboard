/**
 * Pattern detection against the local Supabase database, signed in as a test
 * user. Skipped if the local database isn't running.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getFindings } from "@/lib/server/findings";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";

const EMAIL = "findings-test@personal-os.local";
const PASSWORD = "findings-test-password";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const reachable = await (async () => {
  if (!URL || !KEY || !SECRET) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
})();

const today = "2026-10-25";
const prefs = { timezone: "UTC", workDayStart: "09:00:00", workDayEnd: "17:00:00" };
let supabase: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
let userId: string;

describe.skipIf(!reachable)("pattern findings (real database)", () => {
  beforeAll(async () => {
    admin = createClient<Database>(URL!, SECRET!, { auth: { persistSession: false } });
    const existing = await admin.auth.admin.listUsers();
    if (!existing.data.users.some((u) => u.email === EMAIL)) {
      const { error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
      if (error) throw error;
    }
    supabase = createClient<Database>(URL!, KEY!, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw error;
    userId = data.user.id;
  });

  beforeEach(async () => {
    for (const t of ["tasks", "goals", "projects", "daily_plans", "daily_reviews", "finding_dismissals"] as const) {
      await admin.from(t).delete().eq("user_id", userId);
    }
  });

  it("detects overdue work, repeated reschedules, overload, stalled goals, and old blockers", async () => {
    const { data: tasks } = await supabase.from("tasks").insert([
      { title: "Old invoice", due_date: "2026-10-18", priority: "high" },
      { title: "Big report", due_date: today, estimated_minutes: 360, priority: "high" },
      { title: "Inbox zero", due_date: today, estimated_minutes: 180, priority: "low" },
    ]).select("id, title");
    // Push one task later three times (the trigger counts each push).
    const pushed = tasks!.find((t) => t.title === "Old invoice")!;
    for (const d of ["2026-10-19", "2026-10-20", "2026-10-21"]) await supabase.from("tasks").update({ due_date: d }).eq("id", pushed.id);

    // A goal created a month ago with no progress, and a project blocked since early October.
    await admin.from("goals").insert({ user_id: userId, title: "Learn piano", status: "active", created_at: "2026-09-20T00:00:00Z" });
    const { data: project } = await supabase.from("projects").insert({ name: "Garden shed", status: "active" }).select("id").single();
    await admin.from("project_blockers").insert({ user_id: userId, project_id: project!.id, description: "Waiting for permit", created_at: "2026-10-05T00:00:00Z" });

    const { findings } = await getFindings(supabase as unknown as Db, today, prefs);
    const byType = Object.fromEntries(findings.map((f) => [f.type, f]));

    expect(byType.overload.title).toBe("Today is 1h over capacity");
    const move = byType.overload.actions.find((a) => a.kind === "reschedule_tasks");
    expect(move).toMatchObject({ dueDate: "2026-10-26", taskIds: [tasks!.find((t) => t.title === "Inbox zero")!.id] });
    expect(byType.overdue.evidence).toContain('"Old invoice" (4 days)');
    expect(byType.repeated_reschedule.title).toBe('"Old invoice" has been pushed back 3 times');
    expect(byType.goal_stall.title).toBe('No progress on "Learn piano" in two weeks');
    expect(byType.blocked_project.title).toBe("Garden shed has been blocked for 20 days");
  });

  it("hides dismissed findings until their date, and shows them again when things change", async () => {
    const { data: t } = await supabase.from("tasks").insert({ title: "Tax return", due_date: "2026-10-01" }).select("id").single();
    for (const d of ["2026-10-02", "2026-10-03", "2026-10-04"]) await supabase.from("tasks").update({ due_date: d }).eq("id", t!.id);

    const first = await getFindings(supabase as unknown as Db, today, prefs);
    const f = first.findings.find((x) => x.type === "repeated_reschedule")!;
    await supabase.from("finding_dismissals").insert({ finding_key: f.key, dismissed_until: "9999-12-31" });

    const second = await getFindings(supabase as unknown as Db, today, prefs);
    expect(second.findings.some((x) => x.type === "repeated_reschedule")).toBe(false);
    expect(second.hiddenCount).toBe(1);

    // Pushing it again is a new situation: the finding comes back.
    await supabase.from("tasks").update({ due_date: "2026-10-05" }).eq("id", t!.id);
    const third = await getFindings(supabase as unknown as Db, today, prefs);
    expect(third.findings.find((x) => x.type === "repeated_reschedule")?.title).toBe('"Tax return" has been pushed back 4 times');
  });
});
