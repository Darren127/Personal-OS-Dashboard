import "server-only";

import { cache } from "react";

import { todayIn } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

export type Preferences = {
  displayName: string | null;
  timezone: string;
  workDayStart: string;
  workDayEnd: string;
  weekStartsOn: number;
  aiAutoExecuteLowRisk: boolean;
};

const DEFAULTS: Preferences = {
  displayName: null,
  timezone: "UTC",
  workDayStart: "09:00:00",
  workDayEnd: "17:30:00",
  weekStartsOn: 1,
  aiAutoExecuteLowRisk: false,
};

/** The signed-in user's preferences (defaults if none saved). Cached per request. */
export const getPreferences = cache(async (): Promise<Preferences> => {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  if (!data) return DEFAULTS;
  return {
    displayName: data.display_name,
    timezone: data.timezone,
    workDayStart: data.work_day_start,
    workDayEnd: data.work_day_end,
    weekStartsOn: data.week_starts_on,
    aiAutoExecuteLowRisk: data.ai_auto_execute_low_risk,
  };
});

/** Today's date (YYYY-MM-DD) in the user's timezone. */
export async function getToday() {
  const prefs = await getPreferences();
  return todayIn(prefs.timezone);
}
