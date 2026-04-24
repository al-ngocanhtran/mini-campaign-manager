import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { signToken } from "../middleware/auth.js";
import { registerSchema, loginSchema } from "../validation/schemas.js";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, name, password } = parsed.data;

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const {
    rows: [user],
  } = await pool.query(
    "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
    [email, name, passwordHash]
  );

  const token = signToken({ id: user.id, email: user.email });
  res.status(201).json({ user, token });
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];

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
