import { z } from "zod";

import { GOAL_CATEGORIES, GOAL_HORIZONS, GOAL_STATUSES, PROGRESS_METHODS } from "@/lib/domain";

const optionalNumber = z.coerce.number({ error: "Enter a number." }).finite().optional();

export const goalInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the goal a title.").max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.enum(GOAL_CATEGORIES).default("other"),
    horizon: z.enum(GOAL_HORIZONS).default("annual"),
    status: z.enum(GOAL_STATUSES).default("active"),
    why_it_matters: z.string().trim().max(5000).optional(),
    success_criteria: z.string().trim().max(5000).optional(),
    target_date: z.iso.date("Use a valid date.").optional(),
    parent_goal_id: z.uuid().optional(),
    progress_method: z.enum(PROGRESS_METHODS).default("auto"),
    metric_name: z.string().trim().max(100).optional(),
    metric_unit: z.string().trim().max(30).optional(),
    metric_start: optionalNumber,
    metric_target: optionalNumber,
    metric_current: optionalNumber,
    manual_progress: z.coerce.number().int().min(0, "0–100").max(100, "0–100").optional(),
  })
  .superRefine((g, ctx) => {
    const anyMetric = g.metric_start !== undefined || g.metric_target !== undefined || g.metric_current !== undefined;
    if (g.progress_method === "metric" || anyMetric) {
      if (g.metric_start === undefined) ctx.addIssue({ code: "custom", path: ["metric_start"], message: "Required for a metric." });
      if (g.metric_target === undefined) ctx.addIssue({ code: "custom", path: ["metric_target"], message: "Required for a metric." });
      if (g.metric_current === undefined) ctx.addIssue({ code: "custom", path: ["metric_current"], message: "Required for a metric." });
      if (g.metric_start !== undefined && g.metric_start === g.metric_target) {
        ctx.addIssue({ code: "custom", path: ["metric_target"], message: "Target must differ from the starting value." });
      }
    }
    if (g.progress_method === "manual" && g.manual_progress === undefined) {
      ctx.addIssue({ code: "custom", path: ["manual_progress"], message: "Enter your estimate (0–100)." });
    }
  });

export type GoalInput = z.infer<typeof goalInputSchema>;

export const metricUpdateSchema = z.object({
  metric_current: z.coerce.number({ error: "Enter a number." }).finite(),
});

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(1, "Name the milestone.").max(200),
  due_date: z.iso.date("Use a valid date.").optional(),
});

export const reviewNoteSchema = z.object({
  notes: z.string().trim().min(1, "Write something first.").max(10000),
});
