"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Bot, CircleAlert, Info, Loader2, Sparkles } from "lucide-react";

import { ActionCard, READ_TOOL_LABELS, ToolChip } from "@/components/companion/action-card";
import { Markdown } from "@/components/companion/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { QUICK_PROMPTS } from "@/lib/companion-prompts";
import type { ChatEvent } from "@/lib/server/ai/engine";
import type { ChatItem } from "@/lib/server/companion";
import { cn } from "@/lib/utils";

type LiveTool = Extract<ChatEvent, { type: "tool" }>;
type Notice = Extract<ChatEvent, { type: "notice" }>;
type LiveTurn = { userText: string; text: string; notes: string; tools: LiveTool[]; done: boolean };

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

function ToolList({ tools }: { tools: { key: string; name: string; status: string; summary: string; actionId?: string; error?: string | null; risk?: "low" | "high"; before?: unknown; result?: unknown }[] }) {
  const reads = tools.filter((t) => READ_TOOL_LABELS[t.name]);
  const writes = tools.filter((t) => !READ_TOOL_LABELS[t.name]);
  return (
    <>
      {reads.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reads.map((t) => <ToolChip key={t.key} name={t.name} status={t.status} />)}
        </div>
      )}
      {writes.map((t) => (
        <ActionCard
          key={t.key}
          id={t.actionId}
          toolName={t.name}
          summary={t.summary}
          status={t.status === "done" ? "executed" : (t.status as never)}
          error={t.error}
          risk={t.risk}
          before={t.before}
          result={t.result}
        />
      ))}
    </>
  );
}

export function ChatPanel({
  conversationId,
  items,
  configured,
  initialPrompt,
}: {
  conversationId: string | null;
  items: ChatItem[];
  configured: boolean;
  initialPrompt?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialPrompt ?? "");
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [itemsAtSend, setItemsAtSend] = useState<ChatItem[] | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const convRef = useRef(conversationId);

  // The live turn is shown until the saved version arrives from the server.
  const showLive = live && itemsAtSend === items;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [items, live?.text, live?.tools.length, live?.notes]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setStreaming(true);
    setNotices([]);
    setInput("");
    setItemsAtSend(items);
    setLive({ userText: message, text: "", notes: "", tools: [], done: false });
    convRef.current = conversationId;
    let stored = Boolean(conversationId);

    const update = (fn: (l: LiveTurn) => LiveTurn) => setLive((l) => (l ? fn(l) : l));
    try {
      const res = await fetch("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          switch (e.type) {
            case "conversation":
              convRef.current = e.id;
              stored = true;
              window.history.replaceState(null, "", `/companion?c=${e.id}`);
              break;
            case "text":
              update((l) => ({ ...l, text: l.text + e.delta }));
              break;
            case "progress":
              update((l) => ({ ...l, notes: l.notes + e.delta }));
              break;
            case "step":
              update((l) => ({ ...l, text: l.text ? `${l.text}\n\n` : l.text, notes: "" }));
              break;
            case "tool":
              update((l) => ({ ...l, tools: [...l.tools.filter((t) => t.toolUseId !== e.toolUseId), e] }));
              break;
            case "notice":
              setNotices((n) => [...n, e]);
              break;
            case "done":
              update((l) => ({ ...l, done: true }));
              break;
          }
        }
      }
    } catch (err) {
      setNotices((n) => [...n, { type: "notice", level: "error", message: err instanceof Error ? err.message : "Couldn't reach the server." }]);
    } finally {
      setStreaming(false);
      if (stored) {
        // Load the saved transcript (the live view is replaced by it).
        startTransition(() => router.refresh());
      } else {
        // Nothing was saved: give the message back so it can be retried.
        setLive(null);
        setInput(message);
      }
    }
  }

  const empty = items.length === 0 && !live;

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-5 pb-4">
        {empty && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Sparkles className="size-6" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">How can I help?</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                I work from your real tasks, goals, projects, and reviews. I&apos;ll be honest about what the data shows, and I&apos;ll ask before changing anything unless you allow it in Settings.
              </p>
            </div>
            {configured && (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {Object.entries(QUICK_PROMPTS).map(([key, p]) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => send(p.text)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {items.map((item) =>
          item.kind === "user" ? (
            <UserBubble key={item.id} text={item.text} />
          ) : (
            <AssistantRow key={item.id}>
              {item.notes.map((n, i) => (
                <p key={i} className="text-xs text-muted-foreground italic">{n}</p>
              ))}
              {item.text && <Markdown>{item.text}</Markdown>}
              <ToolList
                tools={item.tools.map((t) => ({
                  key: t.id,
                  name: t.name,
                  status: t.action?.status ?? "done",
                  summary: t.action?.summary ?? t.name,
                  actionId: t.action?.id,
                  error: t.action?.error,
                  risk: t.action?.risk_level,
                  before: t.action?.before_state,
                  result: t.action?.result,
                }))}
              />
              {item.declined && <p className="text-xs text-muted-foreground">This response was declined by a safety filter.</p>}
            </AssistantRow>
          ),
        )}

        {showLive && (
          <>
            <UserBubble text={live.userText} />
            <AssistantRow>
              {live.notes && <p className="text-xs text-muted-foreground italic">{live.notes}</p>}
              {live.text ? <Markdown>{live.text}</Markdown> : null}
              <ToolList
                tools={live.tools.map((t) => ({ key: t.toolUseId, name: t.name, status: t.status, summary: t.summary, actionId: t.actionId, error: t.error }))}
              />
              {!live.done && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> {live.tools.length || live.text ? "Working…" : "Thinking…"}
                </p>
              )}
            </AssistantRow>
          </>
        )}

        {notices.map((n, i) => (
          <div
            key={i}
            role={n.level === "error" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              n.level === "error" ? "bg-destructive/10 text-destructive" : n.level === "warning" ? "bg-warning/10" : "bg-muted text-muted-foreground",
            )}
          >
            {n.level === "info" ? <Info className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {n.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {configured && (
        <form
          className="sticky bottom-0 -mx-1 border-t bg-background/95 px-1 pt-3 pb-1 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about your day, goals, or projects…"
              aria-label="Message the AI Companion"
              rows={2}
              maxLength={8000}
              className="max-h-48 min-h-12 resize-none"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0" disabled={streaming || !input.trim()} aria-label="Send">
              {streaming ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Enter to send, Shift+Enter for a new line. Uses your Claude API key; each message has a small cost.
          </p>
        </form>
      )}
    </div>
  );
}
