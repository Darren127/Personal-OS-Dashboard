"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  ListPlus,
  Loader2,
  Mail,
  MailWarning,
  RefreshCw,
  Reply,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { connectGmail, createTaskFromEmail } from "@/app/actions/gmail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { runAction } from "@/hooks/use-form-action";
import type { Importance } from "@/lib/email/analysis";
import { gmailMessageUrl } from "@/lib/email/links";
import { proposeTask, type TaskChoice } from "@/lib/email/to-task";
import type { EmailItem } from "@/lib/server/gmail/service";

const IMPORTANCE_BADGE: Record<Importance, { label: string; variant: "destructive" | "warning" | "secondary" | "outline" }> = {
  critical: { label: "Critical", variant: "destructive" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "secondary" },
  low: { label: "Low", variant: "outline" },
};

const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected. Press Refresh to fetch your recent email." },
  denied: { ok: false, text: "Gmail wasn't connected: access was declined on Google's screen." },
  scope_missing: { ok: false, text: "Gmail wasn't connected: the permission to read email wasn't granted. Try again and leave it ticked." },
  no_refresh_token: { ok: false, text: "Google didn't grant long-term access. Remove Personal OS at myaccount.google.com/permissions, then connect again." },
  expired: { ok: false, text: "The connection attempt took too long. Please try again." },
  invalid_state: { ok: false, text: "The connection attempt couldn't be verified, so it was stopped. Please try again from this page." },
  not_configured: { ok: false, text: "Gmail isn't set up on the server yet." },
  error: { ok: false, text: "Connecting Gmail failed. Please try again." },
};

/** Shows the result of the Google round trip once, then cleans the URL. */
function ReturnNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const shown = useRef(false);
  const status = params.get("gmail");
  useEffect(() => {
    if (!status || shown.current) return;
    shown.current = true;
    const msg = RETURN_MESSAGES[status] ?? RETURN_MESSAGES.error;
    if (msg.ok) toast.success(msg.text);
    else toast.error(msg.text, { duration: 10_000 });
    router.replace("/", { scroll: false });
  }, [status, router]);
  return null;
}

export function ConnectGmailButton({ label = "Connect Gmail" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          // On success the action redirects to Google; only failures return.
          const result = await connectGmail();
          if (result && !result.ok) toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Mail />} {label}
    </Button>
  );
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function refresh() {
    setPending(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!body) toast.error("The sync failed. Try again.");
      else if (!body.ok) toast.error(body.message ?? body.error ?? "The sync failed.");
      else {
        const parts = [`${body.fetched} new ${body.fetched === 1 ? "email" : "emails"}`];
        if (body.analyzed) parts.push(`${body.analyzed} analysed`);
        toast.success(`Gmail synced: ${parts.join(", ")}.`);
        if (body.analysisNotice) toast.info(body.analysisNotice, { duration: 10_000 });
      }
    } catch {
      toast.error("Couldn't reach the server. Check your connection.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={refresh} disabled={pending} aria-label="Refresh email">
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {pending ? "Syncing…" : "Refresh"}
    </Button>
  );
}

function CreateTaskButton({ email, account }: { email: EmailItem; account: string }) {
  const [choice, setChoice] = useState<TaskChoice | null>(null);
  const [pending, start] = useTransition();
  if (!email.analysis || email.taskId) {
    return email.taskId ? <Badge variant="success">Task created</Badge> : null;
  }
  const a = email.analysis;
  const options: { choice: TaskChoice; label: string }[] = [
    ...a.action_items.map((item, i) => ({ choice: `action:${i}` as TaskChoice, label: item.description })),
    ...(a.needs_reply ? [{ choice: "reply" as TaskChoice, label: "Reply to this email" }] : []),
  ];
  if (!options.length) return null;
  const forTask = { providerMessageId: email.providerMessageId, fromName: email.fromName, fromEmail: email.fromEmail, subject: email.subject, analysis: a };
  const proposal = choice ? proposeTask(forTask, choice, account) : null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Button key={o.choice} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setChoice(o.choice)}>
            <ListPlus /> <span className="max-w-56 truncate">Task: {o.label}</span>
          </Button>
        ))}
      </div>
      <Dialog open={choice !== null} onOpenChange={(open) => !open && setChoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create this task?</DialogTitle>
            <DialogDescription>It will be added to your Inbox. Nothing is sent to anyone.</DialogDescription>
          </DialogHeader>
          {proposal && (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Title</dt><dd className="font-medium [overflow-wrap:anywhere]">{proposal.title}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="capitalize">{proposal.priority}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Due date</dt>
                <dd>
                  {proposal.due_date ?? "None"}
                  {proposal.dueQuote && <span className="block text-xs text-muted-foreground">From the email: “{proposal.dueQuote}”</span>}
                </dd>
              </div>
              {a.suspicious && (
                <p className="flex gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  <ShieldAlert className="size-4 shrink-0" /> This email looks suspicious. Check it in Gmail before acting on it.
                </p>
              )}
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChoice(null)} disabled={pending}>Cancel</Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await runAction(createTaskFromEmail(email.id, choice!));
                  if (r.ok) setChoice(null);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailRow({ email, account, formatTime }: { email: EmailItem; account: string; formatTime: (iso: string) => string }) {
  const a = email.analysis;
  const badge = a ? IMPORTANCE_BADGE[a.importance] : null;
  return (
    <li className="min-w-0 space-y-1.5 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        {email.isUnread && <Badge variant="outline">Unread</Badge>}
        {a?.needs_reply && <Badge variant="outline"><Reply /> Reply needed</Badge>}
        {a?.suspicious && <Badge variant="destructive"><ShieldAlert /> Suspicious</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{formatTime(email.receivedAt)}</span>
      </div>
      <a
        href={gmailMessageUrl(email.providerMessageId, account)}
        target="_blank"
        rel="noopener noreferrer"
        className="group block min-w-0"
      >
        <span className="block truncate text-sm font-medium group-hover:underline">
          {email.subject} <ExternalLink className="inline size-3 text-muted-foreground" aria-label="(opens Gmail)" />
        </span>
        <span className="block truncate text-xs text-muted-foreground">{email.fromName ?? email.fromEmail}</span>
      </a>
      {a ? (
        <div className="space-y-1 text-sm">
          <p className="[overflow-wrap:anywhere]">{a.summary}</p>
          {a.deadlines.map((d, i) => (
            <p key={i} className="flex gap-1.5 text-xs [overflow-wrap:anywhere]">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                {d.description}
                {d.date && <strong> · due {d.date}</strong>} — the email says “{d.quote}”
              </span>
            </p>
          ))}
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <Sparkles className="mr-1 inline size-3" />
            AI: {a.importance_reason}
            {a.suggested_next_action && ` Suggested: ${a.suggested_next_action}`}
            {a.confidence !== "high" && ` (confidence: ${a.confidence}${a.uncertainty ? ` — ${a.uncertainty}` : ""})`}
          </p>
          {a.suspicious && a.suspicious_reason && (
            <p className="text-xs text-destructive [overflow-wrap:anywhere]">Why suspicious: {a.suspicious_reason}</p>
          )}
          <CreateTaskButton email={email} account={account} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{email.snippet || "Not analysed yet."}</p>
      )}
    </li>
  );
}

const RANK: Record<Importance, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function EmailLists({
  emails,
  account,
  timezone,
}: {
  emails: EmailItem[];
  account: string;
  timezone: string;
}) {
  const [tab, setTab] = useState<"urgent" | "reply" | "actions" | "all">("urgent");
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const formatTime = (iso: string) => fmt.format(new Date(iso));

  const analysed = emails.filter((e) => e.analysis);
  const urgent = analysed
    .filter((e) => e.analysis!.importance === "critical" || e.analysis!.importance === "high")
    .sort((x, y) => RANK[x.analysis!.importance] - RANK[y.analysis!.importance] || Number(y.isUnread) - Number(x.isUnread));
  const reply = analysed.filter((e) => e.analysis!.needs_reply);
  const actions = analysed.filter((e) => e.analysis!.action_required || e.analysis!.deadlines.length);
  const lists = { urgent, reply, actions, all: emails };
  const tabs = [
    { key: "urgent", label: "Urgent", count: urgent.length },
    { key: "reply", label: "Needs reply", count: reply.length },
    { key: "actions", label: "Actions & deadlines", count: actions.length },
    { key: "all", label: "All recent", count: emails.length },
  ] as const;
  const shown = lists[tab].slice(0, 8);

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Email lists" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <Button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            size="sm"
            variant={tab === t.key ? "secondary" : "ghost"}
            className="h-8"
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="tabular-nums text-muted-foreground">{t.count}</span>
          </Button>
        ))}
      </div>
      <div role="tabpanel">
        {shown.length ? (
          <ul>
            {shown.map((e) => <EmailRow key={e.id} email={e} account={account} formatTime={formatTime} />)}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Nothing here.</p>
        )}
        {lists[tab].length > shown.length && (
          <p className="text-xs text-muted-foreground">Showing the {shown.length} most relevant of {lists[tab].length}.</p>
        )}
      </div>
    </div>
  );
}

export function EmailReturnNotice() {
  return <ReturnNotice />;
}

export function ReconnectNotice({ message }: { message: string | null }) {
  return (
    <div className="space-y-3">
      <p className="flex gap-2 rounded-md bg-warning/10 p-3 text-sm">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>{message ?? "Gmail access has expired or was revoked."} Your previously synced emails are still shown below until you reconnect.</span>
      </p>
      <ConnectGmailButton label="Reconnect Gmail" />
    </div>
  );
}

export function SyncErrorNotice({ message }: { message: string }) {
  return (
    <p className="flex gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
      <AlertTriangle className="size-4 shrink-0" /> Last sync failed: {message}
    </p>
  );
}
