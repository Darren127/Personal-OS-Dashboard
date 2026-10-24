import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");

export const timeBlockSchema = z
  .object({
    task_id: z.uuid().optional(),
    title: z.string().trim().max(200).optional(),
    start_time: time,
    end_time: time,
  })
  .refine((b) => b.task_id || b.title, {
    message: "Pick a task or name the block (e.g. Lunch).",
    path: ["title"],
  })
  .refine((b) => b.end_time > b.start_time, {
    message: "End time must be after the start time.",
    path: ["end_time"],
  });

export const dailyNotesSchema = z.object({
  intention: z.string().trim().max(500).optional(),
  notes: z.string().max(20000).optional(),
});

const rating = z.coerce.number().int().min(1).max(5).optional();

export const dailyReviewSchema = z.object({
  wins: z.string().trim().max(5000).optional(),
  challenges: z.string().trim().max(5000).optional(),
  lessons: z.string().trim().max(5000).optional(),
  tomorrow_focus: z.string().trim().max(2000).optional(),
  energy: rating,
  mood: rating,
});
