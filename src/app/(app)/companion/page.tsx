import type { Metadata } from "next";
import { Suspense } from "react";
import { KeyRound } from "lucide-react";

import { ChatPanel } from "@/components/companion/chat-panel";
import { ConversationList } from "@/components/companion/conversation-list";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/skeletons";
import { QUICK_PROMPTS } from "@/lib/companion-prompts";
import { getAiConfig } from "@/lib/server/ai/config";
import { getConversation, listConversations } from "@/lib/server/companion";

export const metadata: Metadata = { title: "AI Companion" };

function SetupNeeded() {
  return (
    <EmptyState
      icon={KeyRound}
      title="Add a Claude API key to start chatting"
      description="The Companion uses the Claude API, which is billed per use through the Anthropic Console — separately from a Claude Pro subscription. Create a key at console.anthropic.com, set ANTHROPIC_API_KEY in the server environment, and restart the app. Memory and the action log work without it."
    />
  );
}

async function CompanionContent({ searchParams }: { searchParams: PageProps<"/companion">["searchParams"] }) {
  const { c, prompt } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;
  const config = getAiConfig();
  const [conversations, current] = await Promise.all([
    listConversations(),
    conversationId ? getConversation(conversationId) : Promise.resolve(null),
  ]);
  const initialPrompt = typeof prompt === "string" ? QUICK_PROMPTS[prompt]?.text : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <aside className="hidden min-w-0 lg:block">
        <ConversationList conversations={conversations} activeId={current?.conversation.id ?? null} />
      </aside>
      <details className="rounded-lg border px-3 py-2 lg:hidden">
        <summary className="cursor-pointer text-sm font-medium">Conversations ({conversations.length})</summary>
        <div className="pt-3">
          <ConversationList conversations={conversations} activeId={current?.conversation.id ?? null} />
        </div>
      </details>
      <section className="min-w-0" aria-label="Conversation">
        {!config.configured && <div className="mb-6"><SetupNeeded /></div>}
        {conversationId && !current ? (
          <p className="text-sm text-muted-foreground">That conversation doesn&apos;t exist or was deleted.</p>
        ) : (
          <ChatPanel
            key={current?.conversation.id ?? "new"}
            conversationId={current?.conversation.id ?? null}
            items={current?.items ?? []}
            configured={config.configured}
            initialPrompt={initialPrompt}
          />
        )}
      </section>
    </div>
  );
}

export default function CompanionPage({ searchParams }: PageProps<"/companion">) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <CompanionContent searchParams={searchParams} />
    </Suspense>
  );
}
