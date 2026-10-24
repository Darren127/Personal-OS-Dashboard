"use client";

import { Loader2 } from "lucide-react";

import { savePreferences } from "@/app/actions/preferences";
import { errorProps, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

export function PreferencesForm({
  displayName,
  timezone,
  workDayStart,
  workDayEnd,
  timezones,
}: {
  displayName: string | null;
  timezone: string;
  workDayStart: string;
  workDayEnd: string;
  timezones: string[];
}) {
  const { pending, onSubmit, fieldErrors: e } = useFormAction(savePreferences);
  const zones = timezones.includes(timezone) ? timezones : [timezone, ...timezones];

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormField id="pref-name" label="Your name" hint="Used in your daily greeting.">
        <Input id="pref-name" name="display_name" defaultValue={displayName ?? ""} maxLength={80} />
      </FormField>
      <FormField id="pref-tz" label="Timezone" error={e.timezone} hint="Decides when 'today' starts and ends.">
        <NativeSelect id="pref-tz" name="timezone" defaultValue={timezone} {...errorProps("pref-tz", e.timezone)}>
          {zones.map((z) => <option key={z} value={z}>{z.replaceAll("_", " ")}</option>)}
        </NativeSelect>
      </FormField>
      <FormField id="pref-start" label="Working day starts">
        <Input id="pref-start" name="work_day_start" type="time" defaultValue={workDayStart.slice(0, 5)} />
      </FormField>
      <FormField id="pref-end" label="Working day ends" error={e.work_day_end}
        hint="Used to warn you when today's plan doesn't fit.">
        <Input id="pref-end" name="work_day_end" type="time" defaultValue={workDayEnd.slice(0, 5)} {...errorProps("pref-end", e.work_day_end)} />
      </FormField>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Save preferences
        </Button>
      </div>
    </form>
  );
}
