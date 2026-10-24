import type { z } from "zod";

/**
 * Every server action returns this shape so forms can show a clear message
 * and per-field errors. `ok: true` is only returned after the database
 * confirms the write.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const idle: ActionResult = { ok: true };

export function validationFailed(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}

/** Map a Supabase/PostgREST error to a message that's safe and useful to show. */
export function dbFailed(error: { code?: string; message: string }): ActionResult<never> {
  console.error("[db]", error.code, error.message);
  switch (error.code) {
    case "23505":
      return { ok: false, error: "That would create a duplicate entry." };
    case "23503":
      return { ok: false, error: "A linked item no longer exists. Refresh and try again." };
    case "23514":
      return { ok: false, error: "Some values are out of range (check dates and numbers)." };
    case "42501":
      return { ok: false, error: "You don't have permission to change that." };
    default:
      return { ok: false, error: "Couldn't save your changes. Please try again." };
  }
}

/** Convert FormData into a plain object, turning empty strings into undefined. */
export function formToObject(formData: FormData, multi: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    if (multi.includes(key)) {
      out[key] = formData.getAll(key).map(String).filter(Boolean);
      continue;
    }
    const value = formData.get(key);
    out[key] = typeof value === "string" && value.trim() === "" ? undefined : value;
  }
  return out;
}
