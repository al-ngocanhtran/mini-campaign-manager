import { z } from "zod";

// Top entries from breach corpora (Have I Been Pwned, RockYou). Padded to >=12 chars
// because shorter strings are already rejected by the length rule.
export const COMMON_PASSWORDS = new Set([
  "password1234",
  "passw0rd1234",
  "password12345",
  "qwerty123456",
  "qwertyuiop12",
  "123456789012",
  "1234567890ab",
  "abcdefghijkl",
  "letmein12345",
  "iloveyou1234",
  "welcome12345",
  "admin1234567",
  "administrator",
  "monkey123456",
  "dragon123456",
  "football1234",
  "baseball1234",
  "sunshine1234",
  "princess1234",
  "trustno1abcd",
  "starwars1234",
  "whatever1234",
  "changeme1234",
  "passwordpassword",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "Please enter a valid email address" })
  .max(254, { message: "Email is too long" });

const passwordRegisterSchema = z
  .string()
  .min(12, { message: "Password must be at least 12 characters" })
  .max(128, { message: "Password must be at most 128 characters" })
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
    message: "This password is too common, choose a stronger one",
  });

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, { message: "Name is required" }).max(255, { message: "Name is too long" }),
  password: passwordRegisterSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Password is required" }),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  recipientEmails: z.array(z.string().email()).min(1).max(1000),
});

export const updateCampaignSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    subject: z.string().min(1).max(500).optional(),
    body: z.string().min(1).optional(),
    recipientEmails: z.array(z.string().email()).min(1).max(1000).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.subject !== undefined ||
      v.body !== undefined ||
      v.recipientEmails !== undefined,
    { message: "At least one field must be provided" }
  );

// Require an explicit timezone offset. PostgreSQL stores the column as
// `timestamp with time zone`, so a naive ISO ("2026-05-09T10:00:00") would be
// interpreted in the server's locale and silently mean different points in time
// depending on where the API runs. The frontend must convert datetime-local
// input through new Date(local).toISOString() before sending.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const scheduleCampaignSchema = z.object({
  scheduled_at: z
    .string()
    .regex(ISO_WITH_OFFSET, {
      message:
        "scheduled_at must be an ISO 8601 timestamp with explicit timezone offset (e.g. 2026-05-09T10:00:00Z)",
    })
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: "scheduled_at must be a valid ISO timestamp",
    }),
});

export const createRecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
});
