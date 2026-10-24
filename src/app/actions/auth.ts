"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions";
import { isValidTimezone } from "@/lib/dates";
import { createClient, getSupabaseConfig } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  timezone: z.string().optional(),
  next: z.string().optional(),
});

/** Only allow redirects to paths inside this app. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!getSupabaseConfig()) {
    return { ok: false, error: "The database isn't configured yet. See Settings → setup steps in the README." };
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    timezone: formData.get("timezone") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    // Same message whether the email or the password was wrong.
    return { ok: false, error: "Incorrect email or password." };
  }

  // First sign-in: remember the browser's timezone so "today" is correct.
  const tz = parsed.data.timezone;
  if (tz && isValidTimezone(tz)) {
    await supabase
      .from("user_preferences")
      .upsert({ timezone: tz }, { onConflict: "user_id", ignoreDuplicates: true });
  }

  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
