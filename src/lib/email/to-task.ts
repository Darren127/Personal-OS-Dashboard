import type { EmailAnalysis, Importance } from "@/lib/email/analysis";
import { gmailMessageUrl } from "@/lib/email/links";

/** What can become a task: one of the email's action items, or "reply to it". */
export type TaskChoice = "reply" | `action:${number}`;

export type EmailForTask = {
  providerMessageId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  analysis: EmailAnalysis;
};

const PRIORITY: Record<Importance, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

/**
 * The task a choice would create. Used for the confirmation preview and,
 * recomputed from stored data, by the server when creating it.
 * Only deadlines verified against the email's text become due dates.
 */
export function proposeTask(email: EmailForTask, choice: TaskChoice, account: string | null) {
  const a = email.analysis;
  const sender = email.fromName ?? email.fromEmail ?? "sender";
  let title: string;
  let quote: string | null = null;
  if (choice === "reply") {
    title = `Reply to ${sender}: ${email.subject}`;
  } else {
    const item = a.action_items[Number(choice.slice("action:".length))];
    if (!item) return null;
    title = item.description;
    quote = item.quote;
  }
  const dated = a.deadlines.filter((d) => d.date).sort((x, y) => x.date!.localeCompare(y.date!));
  const due = dated[0] ?? null;
  const description = [
    `From email: "${email.subject}" — ${sender}${email.fromEmail && email.fromName ? ` <${email.fromEmail}>` : ""}`,
    `Summary: ${a.summary}`,
    quote && `The email says: "${quote}"`,
    due && `Deadline stated in the email: "${due.quote}"`,
    `Open in Gmail: ${gmailMessageUrl(email.providerMessageId, account)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title: title.length > 300 ? `${title.slice(0, 299)}…` : title,
    description,
    priority: PRIORITY[a.importance],
    due_date: due?.date ?? null,
    dueQuote: due?.quote ?? null,
  };
}

export function isTaskChoice(v: unknown): v is TaskChoice {
  return typeof v === "string" && (v === "reply" || /^action:[0-4]$/.test(v));
}
