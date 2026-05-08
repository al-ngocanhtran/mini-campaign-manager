import * as api from "@/api/client";
import type { RecipientRow } from "@/api/client";

export const RECIPIENTS_QUERY_KEY = ["recipients"] as const;
const PAGE_SIZE = 100;

export async function fetchAllRecipients(): Promise<RecipientRow[]> {
  const first = await api.getRecipients(1, PAGE_SIZE);
  if (first.total <= PAGE_SIZE) return first.recipients;
  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map((p) =>
      api.getRecipients(p, PAGE_SIZE).then((r) => r.recipients),
    ),
  );
  return [...first.recipients, ...rest.flat()];
}
