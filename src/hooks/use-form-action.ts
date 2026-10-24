"use client";

import { useActionState, useEffect, useRef, startTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions";

/**
 * Wraps a server action for use in a form.
 *
 * Submits via onSubmit (not the `action` prop) so React does not clear the
 * form when validation fails — the user keeps what they typed. Shows a toast
 * on success/failure and calls `onSuccess` once the server confirms.
 */
export function useFormAction<T>(
  action: (prev: ActionResult<T>, formData: FormData) => Promise<ActionResult<T>>,
  options: { onSuccess?: (result: Extract<ActionResult<T>, { ok: true }>) => void; toastOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState(action, { ok: true } as ActionResult<T>);
  const submitted = useRef(false);
  const onSuccess = useRef(options.onSuccess);
  useEffect(() => {
    onSuccess.current = options.onSuccess;
  });

  useEffect(() => {
    if (!submitted.current || pending) return;
    submitted.current = false;
    if (state.ok) {
      if (state.message && options.toastOnSuccess !== false) toast.success(state.message);
      onSuccess.current?.(state);
    } else {
      toast.error(state.error);
    }
  }, [state, pending, options.toastOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    submitted.current = true;
    startTransition(() => dispatch(formData));
  }

  const fieldErrors = !state.ok ? (state.fieldErrors ?? {}) : {};
  return { state, pending, onSubmit, fieldErrors };
}

/** Run a one-off server action (button click) with toast feedback. */
export function runAction(
  promise: Promise<ActionResult<unknown>>,
  successMessage?: string,
) {
  return promise.then(
    (result) => {
      if (result.ok) {
        const msg = successMessage ?? result.message;
        if (msg) toast.success(msg);
      } else {
        toast.error(result.error);
      }
      return result;
    },
    () => {
      toast.error("Couldn't reach the server. Check your connection and try again.");
      return { ok: false as const, error: "network" };
    },
  );
}
