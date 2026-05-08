import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CampaignStats } from "@/api/client";

export function StatsDisplay({ stats }: { stats: CampaignStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Sent" value={stats.sent} tone="emerald" />
        <StatTile label="Failed" value={stats.failed} tone="rose" />
        <StatTile label="Opened" value={stats.opened} tone="indigo" />
      </div>

      <Card className="p-6">
        <RateRow label="Send rate" value={stats.send_rate} />
        <Separator className="my-5" />
        <RateRow label="Open rate" value={stats.open_rate} />
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "rose" | "indigo";
}) {
  return (
    <div className="bg-card p-5">
      <div
        className={cn(
          "font-serif text-3xl font-medium leading-none tabular-nums tracking-tight sm:text-4xl",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "rose" && "text-rose-600 dark:text-rose-400",
          tone === "indigo" && "text-indigo-600 dark:text-indigo-400",
        )}
      >
        {value}
      </div>
      <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function RateRow({ label, value }: { label: string; value: number }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </span>
          <span className="font-serif text-2xl font-medium tabular-nums">
            {pct.toFixed(0)}
            <span className="ml-0.5 text-base text-muted-foreground">%</span>
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {/* Editorial flourish — appears only on wide screens. Single-orange arc. */}
      <svg
        viewBox="0 0 36 36"
        className="hidden size-9 lg:block"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray={`${pct} 100`}
          pathLength={100}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
      </svg>
    </div>
  );
}
