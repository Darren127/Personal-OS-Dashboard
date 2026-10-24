"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Link2, Loader2, Unlink } from "lucide-react";

import { linkProjectGoal, unlinkProjectGoal } from "@/app/actions/shared";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { runAction } from "@/hooks/use-form-action";

type Item = { id: string; label: string; meta?: string };

/**
 * Manage project ↔ goal links from either side. `from` is the record whose
 * page we're on; `linked` and `available` are records of the other kind.
 */
export function ProjectGoalLinks({
  from,
  fromId,
  linked,
  available,
}: {
  from: "goal" | "project";
  fromId: string;
  linked: Item[];
  available: Item[];
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const other = from === "goal" ? "project" : "goal";
  const ids = (otherId: string) =>
    from === "goal" ? ([otherId, fromId] as const) : ([fromId, otherId] as const);
  const choices = available.filter((a) => !linked.some((l) => l.id === a.id));

  return (
    <div className="space-y-3">
      {linked.length > 0 ? (
        <ul className="space-y-1">
          {linked.map((l) => (
            <li key={l.id} className="group flex items-center gap-2 text-sm">
              <Link href={`/${other}s/${l.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {l.label}
              </Link>
              {l.meta && <span className="text-xs text-muted-foreground">{l.meta}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-50 group-hover:opacity-100"
                aria-label={`Unlink ${l.label}`}
                onClick={() => runAction(unlinkProjectGoal(...ids(l.id)))}
              >
                <Unlink />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No linked {other}s.</p>
      )}
      {choices.length > 0 && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            startTransition(async () => {
              const r = await runAction(linkProjectGoal(...ids(selected)));
              if (r.ok) setSelected("");
            });
          }}
        >
          <NativeSelect aria-label={`Choose a ${other} to link`} value={selected}
            onChange={(e) => setSelected(e.target.value)} className="min-w-0 flex-1">
            <option value="">Link a {other}…</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </NativeSelect>
          <Button type="submit" variant="outline" size="icon" disabled={!selected || pending} aria-label={`Link ${other}`}>
            {pending ? <Loader2 className="animate-spin" /> : <Link2 />}
          </Button>
        </form>
      )}
    </div>
  );
}
