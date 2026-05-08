import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { RecipientPicker } from "@/components/RecipientPicker";
import { useIsMobile } from "@/lib/use-media-query";

export function CampaignNew() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [minScheduleAt] = useState(() =>
    new Date(Date.now() + 60_000).toISOString().slice(0, 16),
  );

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const mutation = useMutation({
    mutationFn: async (input: {
      name: string;
      subject: string;
      body: string;
      recipientEmails: string[];
      scheduledAt: string;
    }) => {
      const created = await api.createCampaign({
        name: input.name,
        subject: input.subject,
        body: input.body,
        recipientEmails: input.recipientEmails,
      });
      let scheduleError: Error | null = null;
      if (input.scheduledAt) {
        try {
          await api.scheduleCampaign(
            created.id,
            new Date(input.scheduledAt).toISOString(),
          );
        } catch (e) {
          scheduleError = e instanceof Error ? e : new Error("Unknown error");
        }
      }
      return { campaign: created, scheduleError };
    },
    onSuccess: ({ campaign, scheduleError }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      if (scheduleError) {
        toast.error("Draft saved, but couldn't schedule", {
          description: scheduleError.message,
        });
      } else if (scheduleDate) {
        toast.success("Campaign scheduled", {
          description: new Date(scheduleDate).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        });
      } else {
        toast.success("Campaign created", { description: campaign.name });
      }
      navigate(`/campaigns/${campaign.id}`);
    },
    onError: (err: Error) => {
      toast.error("Couldn't create campaign", { description: err.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmails.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    mutation.mutate({
      name,
      subject,
      body,
      recipientEmails: selectedEmails,
      scheduledAt: scheduleDate,
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2 text-muted-foreground"
        onClick={() => navigate("/campaigns")}
      >
        <ArrowLeft className="size-4" />
        Back to campaigns
      </Button>

      <PageHeader
        eyebrow="New campaign"
        title="Compose"
        description="Draft your message, attach recipients, and send or schedule when ready."
      />

      <Card>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="name">Campaign name</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring Sale 2026"
              />
              <p className="text-xs text-muted-foreground">
                Internal label, not visible to recipients.
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="subject">Email subject</Label>
              <Input
                id="subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Don't miss our spring sale"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Email body</Label>
              <Textarea
                id="body"
                required
                rows={isMobile ? 6 : 10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email content here…"
                className="font-mono text-sm leading-relaxed"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Recipients</Label>
              <RecipientPicker
                selectedIds={selectedIds}
                onChange={(ids, emails) => {
                  setSelectedIds(ids);
                  setSelectedEmails(emails);
                }}
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label
                htmlFor="schedule-at"
                className="flex items-center gap-2"
              >
                <CalendarClock className="size-4 text-muted-foreground" />
                Schedule (optional)
              </Label>
              <Input
                id="schedule-at"
                type="datetime-local"
                value={scheduleDate}
                min={minScheduleAt}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {scheduleDate
                  ? `Will send on ${new Date(scheduleDate).toLocaleString(undefined, {
                      dateStyle: "full",
                      timeStyle: "short",
                    })}`
                  : "Leave blank to save as a draft. You can schedule later."}
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/campaigns")}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || selectedEmails.length === 0}
              className="w-full sm:w-auto"
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {scheduleDate ? "Schedule campaign" : "Create campaign"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
