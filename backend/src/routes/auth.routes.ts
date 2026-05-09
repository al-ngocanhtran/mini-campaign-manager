import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validation/schemas.js";
import * as ctrl from "../controllers/auth.controller.js";

// Per-IP rate limit on auth endpoints. bcrypt cost 12 ≈ 300ms/attempt is per-attempt
// slow but doesn't bound concurrency, so a parallel attacker can still saturate the
// bcrypt thread pool. Disabled in tests because vitest runs are single-process and
// the in-memory limiter would leak state across describe blocks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
  skip: () => config.rateLimitDisabled,
});

const router = Router();
router.post("/register", authLimiter, validate(registerSchema), ctrl.register);
router.post("/login",    authLimiter, validate(loginSchema),    ctrl.login);

export default router;
