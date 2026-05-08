import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Campaign, Recipient } from "@/api/client";

const campaignBadge = cva(
  "uppercase tracking-[0.10em] text-[11px] font-mono font-medium border",
  {
    variants: {
      status: {
        draft:
          "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800",
        scheduled:
          "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-900",
        sending:
          "bg-amber-50 text-amber-700 border-amber-200 status-crawl dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
        sent:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
      },
    },
  },
);

type CampaignStatus = Campaign["status"];

export function StatusBadge({
  status,
  className,
}: { status: CampaignStatus } & VariantProps<typeof campaignBadge> & {
    className?: string;
  }) {
  return (
    <Badge variant="outline" className={cn(campaignBadge({ status }), className)}>
      {status}
    </Badge>
  );
}

const recipientBadge = cva(
  "uppercase tracking-[0.10em] text-[11px] font-mono font-medium border",
  {
    variants: {
      status: {
        pending:
          "bg-muted text-muted-foreground border-border",
        sent:
          "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
        failed:
          "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
      },
    },
  },
);

type RecipientStatus = Recipient["status"];

export function RecipientStatusBadge({
  status,
  className,
}: { status: RecipientStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(recipientBadge({ status }), className)}>
      {status}
    </Badge>
  );
}
