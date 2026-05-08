import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Search, X } from "lucide-react";

import { type RecipientRow } from "@/api/client";
import { AddRecipientDialog } from "@/components/AddRecipientDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllRecipients, RECIPIENTS_QUERY_KEY } from "@/lib/recipients";
import { cn } from "@/lib/utils";

interface Props {
  selectedIds: Set<number>;
  onChange: (nextIds: Set<number>, nextEmails: string[]) => void;
  disabled?: boolean;
}

export function RecipientPicker({ selectedIds, onChange, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const recipientsQuery = useQuery({
    queryKey: RECIPIENTS_QUERY_KEY,
    queryFn: fetchAllRecipients,
  });

  const recipients = useMemo(
    () => recipientsQuery.data ?? [],
    [recipientsQuery.data],
  );

  const emailById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of recipients) m.set(r.id, r.email);
    return m;
  }, [recipients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.name?.toLowerCase().includes(q) ?? false),
    );
  }, [recipients, search]);

  const emailsFor = (ids: Set<number>, source: RecipientRow[] = recipients) => {
    const map = source === recipients ? emailById : new Map(source.map((r) => [r.id, r.email]));
    const out: string[] = [];
    for (const id of ids) {
      const e = map.get(id);
      if (e) out.push(e);
    }
    return out;
  };

  const emit = (nextIds: Set<number>, source?: RecipientRow[]) => {
    onChange(nextIds, emailsFor(nextIds, source));
  };

  const toggle = (id: number) => {
    if (disabled) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    emit(next);
  };

  const selectAllFiltered = () => {
    if (disabled) return;
    const next = new Set(selectedIds);
    for (const r of filtered) next.add(r.id);
    emit(next);
  };

  const clearAll = () => {
    if (disabled) return;
    onChange(new Set(), []);
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
          {selectedIds.size} selected
          {recipients.length > 0 && (
            <span className="text-muted-foreground/60">
              {" "}
              / {recipients.length} total
            </span>
          )}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAllFiltered}
            disabled={disabled || filtered.length === 0 || allFilteredSelected}
          >
            {search.trim() ? "Select filtered" : "Select all"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={disabled || selectedIds.size === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selectedIds).map((id) => {
            const email = emailById.get(id);
            if (!email) return null;
            return (
              <Badge
                key={id}
                variant="outline"
                className="gap-1 pr-1 font-mono text-[11px]"
              >
                {email}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  aria-label={`Remove ${email}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search recipients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled || (recipientsQuery.isLoading && recipients.length === 0)}
          className="pl-8 font-mono text-sm"
        />
      </div>

      <div className="rounded-md border">
        <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
          {recipientsQuery.isLoading && recipients.length === 0 ? (
            <PickerSkeletonRows />
          ) : recipientsQuery.error ? (
            <li className="space-y-2 p-4 text-center text-sm">
              <p className="text-muted-foreground">
                {recipientsQuery.error instanceof Error
                  ? recipientsQuery.error.message
                  : "Couldn't load recipients."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => recipientsQuery.refetch()}
              >
                Retry
              </Button>
            </li>
          ) : recipients.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">
              No recipients yet — add one below.
            </li>
          ) : filtered.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">
              No matches for "{search}".
            </li>
          ) : (
            filtered.map((r) => {
              const selected = selectedIds.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      selected && "bg-muted/40",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                    aria-pressed={selected}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs">
                        {r.email}
                      </span>
                      {r.name && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.name}
                        </span>
                      )}
                    </span>
                    <Check
                      className={cn(
                        "size-4 shrink-0 transition-opacity",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {!disabled && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="size-4" />
            Add new recipient
          </Button>
          <AddRecipientDialog open={addOpen} onOpenChange={setAddOpen} />
        </div>
      )}
    </div>
  );
}

function PickerSkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-2/3" />
        </li>
      ))}
    </>
  );
}
