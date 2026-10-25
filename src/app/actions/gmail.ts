"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dbFailed, type ActionResult } from "@/lib/actions";
import type { EmailAnalysis } from "@/lib/email/analysis";
import { isTaskChoice, proposeTask, type TaskChoice } from "@/lib/email/to-task";
import { getGmailConfig } from "@/lib/server/gmail/config";
import { decryptSecret } from "@/lib/server/gmail/crypto";
import { revokeRefreshToken, startAuthorization } from "@/lib/server/gmail/google";
import { STATE_COOKIE, newState, stateCookieOptions, stateCookieValue } from "@/lib/server/gmail/oauth-state";
import { requireUser } from "@/lib/supabase/server";

/** Starts "Connect Gmail": remembers a CSRF state, then sends the user to Google. */
export async function connectGmail(): Promise<ActionResult> {
  const { userId } = await requireUser();
  const cfg = getGmailConfig();
  if (!cfg.ok) return { ok: false, error: "Gmail isn't set up on the server yet (see Settings)." };

  const state = newState();
  const { url, codeVerifier } = await startAuthorization(cfg.config, state);
  (await cookies()).set(STATE_COOKIE, stateCookieValue(state, codeVerifier, userId, cfg.config.encryptionKey), stateCookieOptions);
  redirect(url);
}

/**
 * Disconnects Gmail: revokes the app's access at Google, then deletes the
 * stored token and every cached email. Tasks created from emails are kept.
 */
export async function disconnectGmail(): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const { data: conn, error } = await supabase.from("gmail_connections").select("refresh_token_enc").maybeSingle();
  if (error) return dbFailed(error);
  if (!conn) return { ok: true, message: "Gmail is already disconnected." };

  let revoked = false;
  const cfg = getGmailConfig();
  if (cfg.ok) {
    try {
      revoked = await revokeRefreshToken(cfg.config, decryptSecret(conn.refresh_token_enc, cfg.config.encryptionKey));
    } catch {
      revoked = false; // undecryptable token: nothing we can revoke
    }
  }

  const del = await supabase.from("email_messages").delete().eq("user_id", userId);
  if (del.error) return dbFailed(del.error);
  const delConn = await supabase.from("gmail_connections").delete().eq("user_id", userId);
  if (delConn.error) return dbFailed(delConn.error);

  refresh();
  return {
    ok: true,
    message: revoked
      ? "Gmail disconnected and access revoked. Stored emails were deleted."
      : "Gmail disconnected and stored emails deleted. Google didn't confirm the revocation — you can also remove access at myaccount.google.com/permissions.",
  };
}

const taskFromEmailSchema = z.object({ emailId: z.uuid(), choice: z.custom<TaskChoice>(isTaskChoice) });

/**
 * Creates a task from an email after the user confirmed it. The task is
 * built from stored, verified analysis — not from anything the browser sends.
 */
export async function createTaskFromEmail(emailId: string, choice: string): Promise<ActionResult<{ id: string }>> {
  const parsed = taskFromEmailSchema.safeParse({ emailId, choice });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();

  const [{ data: email, error }, { data: conn }] = await Promise.all([
    supabase
      .from("email_messages")
      .select("id, provider_message_id, from_name, from_email, subject, analysis, task_id")
      .eq("id", parsed.data.emailId)
      .maybeSingle(),
    supabase.from("gmail_connections").select("google_email").maybeSingle(),
  ]);
  if (error) return dbFailed(error);
  if (!email?.analysis) return { ok: false, error: "That email is no longer available. Refresh and try again." };
  if (email.task_id) return { ok: false, error: "A task was already created from this email." };

  const proposal = proposeTask(
    {
      providerMessageId: email.provider_message_id,
      fromName: email.from_name,
      fromEmail: email.from_email,
      subject: email.subject ?? "(no subject)",
      analysis: email.analysis as unknown as EmailAnalysis,
    },
    parsed.data.choice,
    conn?.google_email ?? null,
  );
  if (!proposal) return { ok: false, error: "That action item no longer exists." };

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: proposal.title,
      description: proposal.description,
      priority: proposal.priority,
      due_date: proposal.due_date,
      status: "inbox",
      tags: ["email"],
    })
    .select("id")
    .single();
  if (taskError) return dbFailed(taskError);

  // Only link if no other request linked a task in the meantime.
  const { data: linked } = await supabase
    .from("email_messages")
    .update({ task_id: task.id })
    .eq("id", email.id)
    .is("task_id", null)
    .select("id");
  if (!linked?.length) {
    await supabase.from("tasks").delete().eq("id", task.id);
    return { ok: false, error: "A task was already created from this email." };
  }

  refresh();
  return { ok: true, message: "Task created in your Inbox.", data: { id: task.id } };
}
