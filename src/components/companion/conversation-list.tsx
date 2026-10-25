"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";

import { deleteConversation } from "@/app/actions/companion";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { runAction } from "@/hooks/use-form-action";
import { cn } from "@/lib/utils";

export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: { id: string; title: string | null; updated_at: string }[];
  activeId: string | null;
}) {
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button asChild variant="outline" className="w-full justify-start">
        <Link href="/companion">
          <MessageSquarePlus /> New conversation
        </Link>
      </Button>
      {conversations.length > 0 && (
        <ul className="space-y-0.5" aria-label="Conversations">
          {conversations.map((c) => (
            <li key={c.id} className="group relative">
              <Link
                href={`/companion?c=${c.id}`}
                aria-current={c.id === activeId ? "page" : undefined}
                className={cn(
                  "block truncate rounded-md py-1.5 pr-8 pl-3 text-sm transition-colors",
                  c.id === activeId ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {c.title || "Untitled"}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-0.5 right-0.5 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Delete conversation "${c.title}"`}
                onClick={() => setToDelete({ id: c.id, title: c.title || "Untitled" })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this conversation?"
        description={`"${toDelete?.title}" and its messages will be permanently deleted. The action log keeps its record of any changes the AI made.`}
        onConfirm={() => runAction(deleteConversation(toDelete!.id))}
      />
    </div>
  );
}
