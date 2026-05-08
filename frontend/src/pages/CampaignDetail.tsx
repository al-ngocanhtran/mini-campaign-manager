import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CalendarX,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import * as api from "@/api/client";
import { ApiError } from "@/api/client";
import type { CampaignDetail as CampaignDetailType } from "@/api/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { RecipientPicker } from "@/components/RecipientPicker";
import { StatsDisplay } from "@/components/StatsDisplay";
import {
  RecipientStatusBadge,
  StatusBadge,
} from "@/components/StatusBadge";
import { useIsMobile } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const BODY_COLLAPSE_DESKTOP = 600;
const BODY_COLLAPSE_MOBILE = 280;

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [scheduleDate, setScheduleDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", subject: "", body: "" });
  const [editRecipientIds, setEditRecipientIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [editRecipientEmails, setEditRecipientEmails] = useState<string[]>([]);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [minScheduleAt] = useState(() =>
    new Date(Date.now() + 60_000).toISOString().slice(0, 16),
  );

  const campaignId = Number(id);

  // Reset per-campaign UI state when the route param changes.
  // See React docs "Resetting all state when a prop changes".
  const [trackedId, setTrackedId] = useState(campaignId);
  if (trackedId !== campaignId) {
    setTrackedId(campaignId);
    setIsEditing(false);
    setBodyExpanded(false);
    setScheduleDate("");
    setEditRecipientIds(new Set());
    setEditRecipientEmails([]);
  }

  const {
    data: campaign,
    isLoading,
    isFetching: isCampaignFetching,
    error,
  } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.getCampaign(campaignId),
  });

  const { data: stats, isFetching: isStatsFetching } = useQuery({
    queryKey: ["campaign-stats", campaignId],
    queryFn: () => api.getCampaignStats(campaignId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-stats", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const sendMutation = useMutation({
    mutationFn: () => api.sendCampaign(campaignId),
    onSuccess: () => {
      invalidate();
      toast.success("Campaign queued", {
        description: "Recipients are being processed now.",
      });
    },
    onError: (err: Error) =>
      toast.error("Send failed", { description: err.message }),
  });

  const scheduleMutation = useMutation({
    mutationFn: () => api.scheduleCampaign(campaignId, new Date(scheduleDate).toISOString()),
    onSuccess: () => {
      invalidate();
      toast.success("Campaign scheduled", {
        description: new Date(scheduleDate).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      });
      setScheduleDate("");
    },
    onError: (err: Error) =>
      toast.error("Couldn't schedule", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign deleted");
      navigate("/campaigns");
    },
    onError: (err: Error) =>
      toast.error("Couldn't delete", { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateCampaign(campaignId, {
        ...draft,
        recipientEmails: editRecipientEmails,
      }),
    onSuccess: () => {
      invalidate();
      setIsEditing(false);
      toast.success("Campaign updated");
    },
    onError: (err: Error) =>
      toast.error("Couldn't save", { description: err.message }),
  });

  const unscheduleMutation = useMutation({
    mutationFn: () => api.unscheduleCampaign(campaignId),
    onSuccess: () => {
      invalidate();
      setScheduleDate("");
      toast.success("Schedule cancelled", {
        description: "Campaign is back to draft.",
      });
    },
    onError: (err: Error) =>
      toast.error("Couldn't cancel schedule", { description: err.message }),
  });

  if (isLoading) return <DetailSkeleton />;

  if (error) {
    const isNotFound = error instanceof ApiError && error.status === 404;
    const message = isNotFound
      ? "Campaign not found."
      : error instanceof Error
        ? error.message
        : "Failed to load campaign.";
    return (
      <div>
        <BackButton onClick={() => navigate("/campaigns")} />
        <Card className="space-y-4 p-12 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {isNotFound ? "404" : "Error"}
          </p>
          <p className="font-serif text-lg">{message}</p>
          {!isNotFound && (
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              The server returned an error loading this campaign. Try again, or
              head back to the list.
            </p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["campaign", campaignId],
                })
              }
            >
              Retry
            </Button>
            <Button size="sm" onClick={() => navigate("/campaigns")}>
              Back to campaigns
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!campaign) return null;

  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";
  const isSending = campaign.status === "sending";
  const isSent = campaign.status === "sent";
  const canSend = isDraft || isScheduled;
  const threshold = isMobile ? BODY_COLLAPSE_MOBILE : BODY_COLLAPSE_DESKTOP;
  const isLongBody = campaign.body.length > threshold;
  const startEdit = () => {
    setDraft({
      name: campaign.name,
      subject: campaign.subject,
      body: campaign.body,
    });
    setEditRecipientIds(new Set(campaign.recipients.map((r) => r.id)));
    setEditRecipientEmails(campaign.recipients.map((r) => r.email));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft({ name: "", subject: "", body: "" });
    setEditRecipientIds(new Set());
    setEditRecipientEmails([]);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editRecipientEmails.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <div>
      <BackButton onClick={() => navigate("/campaigns")} />

      <PageHeader
        eyebrow={`Campaign · #${campaign.id}`}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {campaign.name}
            <StatusBadge status={campaign.status} />
          </span>
        }
        description={campaign.subject}
      />

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {isEditing ? "Edit draft" : "Email body"}
              </CardTitle>
              <CardDescription className="font-serif text-base text-foreground">
                {isEditing ? "Update name, subject, body, or recipients." : campaign.subject}
              </CardDescription>
            </CardHeader>

            {isEditing ? (
              <form onSubmit={submitEdit}>
                <CardContent className="space-y-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">Campaign name</Label>
                    <Input
                      id="edit-name"
                      required
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-subject">Email subject</Label>
                    <Input
                      id="edit-subject"
                      required
                      value={draft.subject}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, subject: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-body">Email body</Label>
                    <Textarea
                      id="edit-body"
                      required
                      rows={isMobile ? 8 : 12}
                      value={draft.body}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, body: e.target.value }))
                      }
                      className="font-mono text-sm leading-relaxed"
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Recipients</Label>
                    <RecipientPicker
                      selectedIds={editRecipientIds}
                      onChange={(ids, emails) => {
                        setEditRecipientIds(ids);
                        setEditRecipientEmails(emails);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Replaces the entire recipient list on save.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelEdit}
                    disabled={updateMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    <X className="size-4" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      updateMutation.isPending ||
                      editRecipientEmails.length === 0
                    }
                    className="w-full sm:w-auto"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save changes
                  </Button>
                </CardFooter>
              </form>
            ) : (
              <CardContent>
                <div
                  className={cn(
                    "relative",
                    isLongBody && !bodyExpanded && "max-h-72 overflow-hidden",
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {campaign.body}
                  </pre>
                  {isLongBody && !bodyExpanded && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card via-card/80 to-transparent" />
                  )}
                </div>
                {isLongBody && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 -ml-2 text-muted-foreground"
                    onClick={() => setBodyExpanded((v) => !v)}
                    aria-expanded={bodyExpanded}
                  >
                    {bodyExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                    {bodyExpanded ? "Show less" : "Show more"}
                  </Button>
                )}
              </CardContent>
            )}
          </Card>

          {stats && stats.total > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Performance
                {isStatsFetching && (
                  <span className="status-crawl text-muted-foreground/80">
                    Refreshing
                  </span>
                )}
              </h2>
              <StatsDisplay stats={stats} />
            </section>
          )}

          <RecipientsBlock
            recipients={campaign.recipients}
            refreshing={isCampaignFetching}
          />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <p className="text-sm text-muted-foreground">
                  You're editing this draft. Save or cancel your changes to
                  schedule, send, or delete.
                </p>
              ) : (
                <>
                  {isDraft && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={startEdit}
                    >
                      <Pencil className="size-4" />
                      Edit draft
                    </Button>
                  )}

                  {canSend && (
                    <Button
                      className="w-full"
                      onClick={() => sendMutation.mutate()}
                      disabled={sendMutation.isPending}
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Send now
                    </Button>
                  )}

                  {sendMutation.isPending && (
                    <p className="text-xs text-muted-foreground">
                      <span className="status-crawl">Queueing recipients</span>
                    </p>
                  )}

                  {canSend && (
                    <div className="space-y-2">
                      <Label
                        htmlFor="schedule-at"
                        className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                      >
                        {isScheduled ? "Reschedule for" : "Or schedule for"}
                      </Label>
                      <Input
                        id="schedule-at"
                        type="datetime-local"
                        value={scheduleDate}
                        min={minScheduleAt}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => scheduleMutation.mutate()}
                        disabled={!scheduleDate || scheduleMutation.isPending}
                      >
                        {scheduleMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CalendarClock className="size-4" />
                        )}
                        {isScheduled ? "Reschedule" : "Schedule"}
                      </Button>
                    </div>
                  )}

                  {isScheduled && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => unscheduleMutation.mutate()}
                      disabled={unscheduleMutation.isPending}
                    >
                      {unscheduleMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CalendarX className="size-4" />
                      )}
                      Cancel schedule
                    </Button>
                  )}

                  {isSending && (
                    <p className="text-sm text-muted-foreground">
                      <span className="status-crawl">Sending in progress</span>
                    </p>
                  )}

                  {isSent && (
                    <p className="text-sm text-muted-foreground">
                      This campaign has already been sent. Sending is final —
                      no further actions are available.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {isDraft && !isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Danger zone
                </CardTitle>
                <CardDescription>
                  Drafts can be deleted. Sent campaigns cannot.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeleteDialog
                  campaignName={campaign.name}
                  onConfirm={() => deleteMutation.mutate()}
                  pending={deleteMutation.isPending}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 font-mono text-xs">
              <TimelineRow label="Created" value={campaign.created_at} />
              <TimelineRow label="Updated" value={campaign.updated_at} />
              {campaign.scheduled_at && (
                <TimelineRow label="Scheduled" value={campaign.scheduled_at} />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-6 text-muted-foreground"
      onClick={onClick}
    >
      <ArrowLeft className="size-4" />
      <span className="hidden sm:inline">Back to campaigns</span>
      <span className="sm:hidden">Campaigns</span>
    </Button>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right tabular-nums">
        {new Date(value).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    </div>
  );
}

function RecipientsBlock({
  recipients,
  refreshing,
}: {
  recipients: CampaignDetailType["recipients"];
  refreshing: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Recipients · {recipients.length}
          {refreshing && (
            <span className="status-crawl text-muted-foreground/80">
              Refreshing
            </span>
          )}
        </CardTitle>
      </CardHeader>

      {/* Mobile: stacked rows */}
      <CardContent className="md:hidden">
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recipients attached.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recipients.map((r) => (
              <li key={r.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="truncate font-mono text-xs">{r.email}</span>
                  <RecipientStatusBadge status={r.status} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <RecipientMini label="Sent" value={r.sent_at} />
                  <RecipientMini label="Opened" value={r.opened_at} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Desktop: table */}
      <CardContent className="hidden px-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Opened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground"
                >
                  No recipients attached.
                </TableCell>
              </TableRow>
            ) : (
              recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.email}</TableCell>
                  <TableCell>
                    <RecipientStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    {r.sent_at
                      ? new Date(r.sent_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    {r.opened_at
                      ? new Date(r.opened_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecipientMini({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-xs tabular-nums">
        {value
          ? new Date(value).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—"}
      </p>
    </div>
  );
}

function DeleteDialog({
  campaignName,
  onConfirm,
  pending,
}: {
  campaignName: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          disabled={pending}
        >
          <Trash2 className="size-4" />
          Delete campaign
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete <span className="font-serif">{campaignName}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the draft and its recipient list. You
            can't undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading campaign…</span>
      <Skeleton className="mb-6 h-7 w-40" />
      <Skeleton className="mb-3 h-10 w-2/3" />
      <Skeleton className="mb-10 h-5 w-1/2" />
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
