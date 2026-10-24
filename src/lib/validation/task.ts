import { z } from "zod";

import { PRIORITIES, TASK_STATUSES } from "@/lib/domain";

const optionalDate = z.iso.date("Use a valid date.").optional();
const optionalId = z.uuid().optional();
const optionalMinutes = (max: number) =>
  z.coerce
    .number({ error: "Enter a whole number of minutes." })
    .int("Enter a whole number of minutes.")
    .min(0)
    .max(max, `Must be at most ${max} minutes.`)
    .optional();

/** "deep work, admin ,deep work" → ["deep-work", "admin"] */
const tagsField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    const raw = Array.isArray(v) ? v : (v ?? "").split(",");
    const cleaned = raw
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40))
      .filter(Boolean);
    return [...new Set(cleaned)];
  })
  .pipe(z.array(z.string()).max(20, "Use at most 20 tags."));

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title.").max(300, "Keep the title under 300 characters."),
    description: z.string().trim().max(10000).optional(),
    status: z.enum(TASK_STATUSES).default("inbox"),
    priority: z.enum(PRIORITIES).default("medium"),
    due_date: optionalDate,
    start_date: optionalDate,
    /** Wall-clock "YYYY-MM-DDTHH:MM" in the user's timezone. */
    scheduled_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a valid date and time.")
      .optional(),
    estimated_minutes: optionalMinutes(10080).refine((v) => v === undefined || v >= 1, "Must be at least 1 minute."),
    actual_minutes: optionalMinutes(100000),
    project_id: optionalId,
    goal_id: optionalId,
    project_milestone_id: optionalId,
    goal_milestone_id: optionalId,
    tags: tagsField,
  })
  .refine((t) => !t.due_date || !t.start_date || t.due_date >= t.start_date, {
    message: "Due date can't be before the start date.",
    path: ["due_date"],
  });

export type TaskInput = z.infer<typeof taskInputSchema>;

export const quickTaskSchema = z.object({
  title: z.string().trim().min(1, "Type a task first.").max(300),
  due_today: z.enum(["on"]).optional(),
  project_id: optionalId,
  goal_id: optionalId,
});

export const taskStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(TASK_STATUSES),
});

export const taskPrioritySchema = z.object({
  id: z.uuid(),
  priority: z.enum(PRIORITIES),
});

export const idSchema = z.uuid();
