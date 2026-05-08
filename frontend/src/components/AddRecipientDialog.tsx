import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import * as api from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RECIPIENTS_QUERY_KEY } from "@/lib/recipients";
import { validateEmail } from "@/lib/validators";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function AddRecipientDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { email: string; name?: string }) =>
      api.createRecipient(vars),
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setEmail("");
      setName("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (mutation.isPending) return;
    setError(null);

    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    try {
      await mutation.mutateAsync({
        email,
        name: name.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create recipient");
      return;
    }

    await queryClient.invalidateQueries({ queryKey: RECIPIENTS_QUERY_KEY });
    handleOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && email.trim() && !mutation.isPending) {
      e.preventDefault();
      e.stopPropagation();
      submit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add recipient</DialogTitle>
          <DialogDescription>
            Create a new recipient and add them to this campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="add-recipient-email"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Email
            </Label>
            <Input
              id="add-recipient-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder="alice@example.com"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="add-recipient-name"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Name <span className="normal-case tracking-normal">(optional)</span>
            </Label>
            <Input
              id="add-recipient-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Alice"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={mutation.isPending || !email.trim()}
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Add recipient
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
