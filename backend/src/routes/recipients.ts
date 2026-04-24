import { Router, Response } from "express";
import { UniqueConstraintError } from "sequelize";
import { Recipient } from "../models/index.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { createRecipientSchema } from "../validation/schemas.js";

const router = Router();
router.use(authenticate);

// GET /recipients — Paginated list of all recipients
router.get("/", async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
  const offset = (page - 1) * limit;

  const { rows, count } = await Recipient.findAndCountAll({
    order: [["email", "ASC"]],
    limit,
    offset,
  });

  res.json({ recipients: rows, total: count, page, limit });
});

// POST /recipients — Create a recipient (409 on duplicate email)
router.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = createRecipientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const recipient = await Recipient.create({
      email: normalizedEmail,
      name: name ?? normalizedEmail.split("@")[0],
    });
    res.status(201).json(recipient);
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      return res.status(409).json({ error: "Recipient with this email already exists" });
    }
    throw err;
  }
});

export default router;
