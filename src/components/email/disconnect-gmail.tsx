"use client";

import { useState } from "react";
import { Unplug } from "lucide-react";

import { disconnectGmail } from "@/app/actions/gmail";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { runAction } from "@/hooks/use-form-action";

export function DisconnectGmailButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Unplug /> Disconnect Gmail
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Disconnect Gmail?"
        description="Personal OS will revoke its access at Google and delete the emails and analysis it stored. Tasks you created from emails are kept. Your Gmail itself is not changed."
        confirmLabel="Disconnect"
        onConfirm={() => runAction(disconnectGmail())}
      />
    </>
  );
}
