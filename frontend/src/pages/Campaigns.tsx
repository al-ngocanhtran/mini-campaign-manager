import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as Chevron,
  Plus,
  Sparkles,
} from "lucide-react";

import * as api from "@/api/client";
import type { Campaign } from "@/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function Campaigns() {
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns", page],
    queryFn: () => api.getCampaigns(page, limit),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 0;
  const isEmpty = !isLoading && data && data.campaigns.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Campaigns"
        description="Plan, schedule, and send. Track delivery and opens at a glance."
        actions={
          <Button asChild className="w-full sm:w-auto">
            <Link to="/campaigns/new">
              <Plus className="size-4" />
              New campaign
            </Link>
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load campaigns"}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <CampaignsSkeleton />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {data?.campaigns.map((c, i) => (
              <CampaignCard key={c.id} campaign={c} index={i} />
            ))}
          </div>

          {/* Desktop: editorial table */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Recipients
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Created by
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Scheduled
                  </TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.campaigns.map((c) => (
                  <CampaignRow key={c.id} campaign={c} />
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {data?.total} campaigns · Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignRow({ campaign: c }: { campaign: Campaign }) {
  // Row-as-link: the name cell holds the <Link> and its ::before overlay spans
  // the whole row, so any cell click navigates with a single focusable element.
  return (
    <TableRow className="group relative cursor-pointer transition-colors hover:bg-muted/40 focus-within:bg-muted/40">
      <TableCell>
        <Link
          to={`/campaigns/${c.id}`}
          className={cn(
            "block font-medium",
            "before:absolute before:inset-0 before:content-['']",
            "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
          aria-label={`Open campaign ${c.name}`}
        >
          {c.name}
        </Link>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {c.subject}
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={c.status} />
      </TableCell>
      <TableCell className="font-mono text-sm tabular-nums">
        {c.recipient_count ?? 0}
      </TableCell>
      <TableCell className="text-sm">{c.creator.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
        {c.scheduled_at
          ? new Date(c.scheduled_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—"}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
        {new Date(c.created_at).toLocaleDateString(undefined, {
          dateStyle: "medium",
        })}
      </TableCell>
      <TableCell>
        <Chevron className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </TableCell>
    </TableRow>
  );
}

function CampaignCard({
  campaign: c,
  index,
}: {
  campaign: Campaign;
  index: number;
}) {
  const delay = Math.min(index, 8) * 40;
  return (
    <Link
      to={`/campaigns/${c.id}`}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group block rounded-lg border bg-card p-4 transition-colors",
        "hover:border-foreground/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={c.status} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
          {c.scheduled_at
            ? new Date(c.scheduled_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : new Date(c.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
        </span>
      </div>
      <h2 className="mt-3 font-serif text-lg font-medium leading-snug tracking-tight">
        {c.name}
      </h2>
      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
        {c.subject}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {c.recipient_count ?? 0} recipients · {c.creator.name}
        </span>
        <Chevron className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function CampaignsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading campaigns…</span>

      {/* Mobile skeleton: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-4" />
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop skeleton: table rows */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center sm:p-16">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <Sparkles className="size-5 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <h2 className="font-serif text-xl font-medium tracking-tight">
          No campaigns yet
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Compose a message, attach recipients, and choose to send right away or
          schedule for later.
        </p>
      </div>
      <Button asChild>
        <Link to="/campaigns/new">
          <Plus className="size-4" />
          Create your first campaign
        </Link>
      </Button>
    </Card>
  );
}
