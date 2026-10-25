"use client";

import { useState, useTransition } from "react";
import { Archive, Bot, Check, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { createMemory, deleteMemory, setMemoryStatus, updateMemory } from "@/app/actions/companion";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { runAction, useFormAction } from "@/hooks/use-form-action";
import type { Memory } from "@/lib/server/companion";

export const MEMORY_CATEGORY_LABEL: Record<string, string> = {
  preference: "Preferences",
  long_term_goal: "Long-term goals",
  working_style: "Working style",
  recurring_obstacle: "Recurring obstacles",
  decision: "Important decisions",
  lesson: "Lessons learned",
  behavioural_observation: "Behavioural observations",
};

function MemoryForm({ memory, onDone, onCancel }: { memory?: Memory; onDone: () => void; onCancel: () => void }) {
  const { pending, onSubmit, fieldErrors: e } = useFormAction(memory ? updateMemory.bind(null, memory.id) : createMemory, { onSuccess: onDone });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="mem-content" label="Memory" error={e.content} hint="One clear sentence, e.g. “Does deep work best before noon.”">
        <Textarea id="mem-content" name="content" defaultValue={memory?.content} rows={3} maxLength={2000} autoFocus aria-invalid={e.content ? true : undefined} />
      </FormField>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField id="mem-category" label="Category">
          <NativeSelect id="mem-category" name="category" defaultValue={memory?.category ?? "preference"}>
            {Object.entries(MEMORY_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="mem-confidence" label="Confidence">
          <NativeSelect id="mem-confidence" name="confidence" defaultValue={memory?.confidence ?? "confirmed"}>
            <option value="confirmed">Confirmed fact</option>
            <option value="hypothesis">Hypothesis</option>
          </NativeSelect>
        </FormField>
        <FormField id="mem-importance" label="Importance">
          <NativeSelect id="mem-importance" name="importance" defaultValue={memory?.importance ?? 3}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? " (highest)" : n === 1 ? " (lowest)" : ""}</option>)}
          </NativeSelect>
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
      </DialogFooter>
    </form>
  );
}

function MemoryRow({ memory, onEdit }: { memory: Memory; onEdit: (m: Memory) => void }) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const act = (p: Promise<unknown>) => start(async () => { await p; });

  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">{memory.content}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={memory.confidence === "confirmed" ? "secondary" : "outline"}>
            {memory.confidence === "confirmed" ? "Confirmed" : "Hypothesis"}
          </Badge>
          {memory.status === "proposed" && <Badge variant="outline">{MEMORY_CATEGORY_LABEL[memory.category]}</Badge>}
          {memory.created_by === "ai" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bot className="size-3" /> Suggested by AI</span>
          )}
          {memory.importance >= 4 && <span className="text-xs text-muted-foreground">· Important</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {memory.status === "proposed" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => act(runAction(setMemoryStatus(memory.id, "approved")))}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onEdit(memory)}>
              <Pencil /> Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(runAction(setMemoryStatus(memory.id, "rejected")))}>
              <X /> Reject
            </Button>
          </>
        )}
        {memory.status === "approved" && (
          <>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Edit memory" onClick={() => onEdit(memory)}><Pencil /></Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Archive memory" disabled={pending}
              onClick={() => act(runAction(setMemoryStatus(memory.id, "archived")))}><Archive /></Button>
          </>
        )}
        {(memory.status === "archived" || memory.status === "rejected") && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(runAction(setMemoryStatus(memory.id, "approved")))}>
            <RotateCcw /> Restore
          </Button>
        )}
        {memory.status !== "proposed" && (
          <Button size="icon" variant="ghost" className="size-8" aria-label="Delete memory" onClick={() => setConfirmDelete(true)}><Trash2 /></Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this memory?"
        description="It will be permanently removed and the AI won't use it again."
        onConfirm={() => runAction(deleteMemory(memory.id))}
      />
    </li>
  );
}

export function MemoryManager({ memories }: { memories: Memory[] }) {
  const [editing, setEditing] = useState<Memory | "new" | null>(null);
  const [showOld, setShowOld] = useState(false);
  const proposed = memories.filter((m) => m.status === "proposed");
  const approved = memories.filter((m) => m.status === "approved");
  const old = memories.filter((m) => m.status === "archived" || m.status === "rejected");
  const close = () => setEditing(null);

  return (
    <div className="space-y-6">
      {proposed.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Waiting for your review · {proposed.length}</CardTitle>
            <CardDescription>The AI suggested these. Nothing is remembered until you approve it.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">{proposed.map((m) => <MemoryRow key={m.id} memory={m} onEdit={setEditing} />)}</ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>What the AI remembers</CardTitle>
            <CardDescription>
              Used to personalise advice. Hypotheses are treated as tentative. The AI sees the most important memories and those relevant to what you ask.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Add</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {approved.length === 0 && (
            <p className="text-sm text-muted-foreground">No saved memories yet. Add one, or approve the AI&apos;s suggestions as they come up.</p>
          )}
          {Object.entries(MEMORY_CATEGORY_LABEL)
            .filter(([cat]) => approved.some((m) => m.category === cat))
            .map(([cat, label]) => (
              <section key={cat}>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h3>
                <ul className="divide-y">
                  {approved.filter((m) => m.category === cat).map((m) => <MemoryRow key={m.id} memory={m} onEdit={setEditing} />)}
                </ul>
              </section>
            ))}
        </CardContent>
      </Card>

      {old.length > 0 && (
        <div>
          <button type="button" className="cursor-pointer text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowOld((s) => !s)}>
            {showOld ? "Hide" : "Show"} {old.length} archived or rejected
          </button>
          {showOld && <ul className="mt-2 divide-y">{old.map((m) => <MemoryRow key={m.id} memory={m} onEdit={setEditing} />)}</ul>}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add a memory" : editing?.status === "proposed" ? "Edit before approving" : "Edit memory"}</DialogTitle>
            <DialogDescription>Memories should be durable facts or patterns, not one-off details.</DialogDescription>
          </DialogHeader>
          {editing && (
            <MemoryForm
              memory={editing === "new" ? undefined : editing}
              onCancel={close}
              onDone={async () => {
                // Editing a proposal approves it.
                if (editing !== "new" && editing.status === "proposed") await setMemoryStatus(editing.id, "approved");
                close();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
