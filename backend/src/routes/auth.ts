import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { signToken } from "../middleware/auth.js";
import { registerSchema, loginSchema } from "../validation/schemas.js";

const router = Router();
const BCRYPT_ROUNDS = 12;

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, name, password } = parsed.data;

  const existing = await User.findOne({ where: { email }, attributes: ["id"] });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ email, name, password_hash });

  const token = signToken({ id: user.id, email: user.email });
  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
    token,
  });
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const user = await User.findOne({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ id: user.id, email: user.email });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
    token,
  });
});

export default router;
