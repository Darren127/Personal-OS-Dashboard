import { z } from "zod";

export const weeklyReviewSchema = z.object({
  wins: z.string().trim().max(5000).optional(),
  challenges: z.string().trim().max(5000).optional(),
  lessons: z.string().trim().max(5000).optional(),
  next_week_focus: z.string().trim().max(2000).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>;
