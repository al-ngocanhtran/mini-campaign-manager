import type { ZodError } from "zod";

export function fieldErrors(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
