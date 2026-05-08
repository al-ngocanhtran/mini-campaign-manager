import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import * as recipientService from "../services/recipients.service.js";

export async function list(req: AuthRequest, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  res.json(await recipientService.listRecipients(page, limit));
}

export async function create(req: AuthRequest, res: Response) {
  res.status(201).json(await recipientService.createRecipient(req.body));
}
