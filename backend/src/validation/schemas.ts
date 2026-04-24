import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  })
  .refine(
    (v) => v.name !== undefined || v.subject !== undefined || v.body !== undefined,
    { message: "At least one field must be provided" }
  );

export const scheduleCampaignSchema = z.object({
  scheduled_at: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: "scheduled_at must be a valid ISO timestamp" }
  ),
});

export const createRecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
});
