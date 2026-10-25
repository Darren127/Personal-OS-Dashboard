"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { isValidTimezone } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d{2})?$/, "Use a time like 09:00.");

const preferencesSchema = z
  .object({
    display_name: z.string().trim().max(80).optional(),
    timezone: z.string().refine(isValidTimezone, "Choose a valid timezone."),
    work_day_start: time,
    work_day_end: time,
    week_starts_on: z.coerce.number().int().refine((d) => d === 0 || d === 1, "Choose Monday or Sunday."),
  })
  .refine((p) => p.work_day_end > p.work_day_start, {
    message: "The working day must end after it starts.",
    path: ["work_day_end"],
  });

export async function savePreferences(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { error } = await supabase.from("user_preferences").upsert(
    {
      display_name: parsed.data.display_name ?? null,
      timezone: parsed.data.timezone,
      work_day_start: parsed.data.work_day_start,
      work_day_end: parsed.data.work_day_end,
      week_starts_on: parsed.data.week_starts_on,
    },
    { onConflict: "user_id" },
  );
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Preferences saved." };
}
