import { z } from "zod";

import { PRIORITIES, PROJECT_STATUSES } from "@/lib/domain";

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the project a name.").max(200),
    description: z.string().trim().max(5000).optional(),
    objective: z.string().trim().max(2000).optional(),
    status: z.enum(PROJECT_STATUSES).default("planning"),
    priority: z.enum(PRIORITIES).default("medium"),
    start_date: z.iso.date("Use a valid date.").optional(),
    target_date: z.iso.date("Use a valid date.").optional(),
  })
  .refine((p) => !p.start_date || !p.target_date || p.target_date >= p.start_date, {
    message: "The deadline can't be before the start date.",
    path: ["target_date"],
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const blockerInputSchema = z.object({
  description: z.string().trim().min(1, "Describe what's blocking progress.").max(2000),
  task_id: z.uuid().optional(),
});

export const projectNotesSchema = z.object({
  notes: z.string().max(20000).optional(),
});
