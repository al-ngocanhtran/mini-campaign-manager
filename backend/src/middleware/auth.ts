import { Request, Response, NextFunction } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import jwt from "jsonwebtoken";

// Contract:
// - JWT_SECRET is required in every environment except `test`. The narrow
//   test-only fallback exists so a forgotten env var in a forthcoming spec
//   degrades to a noisy warn instead of crashing suite collection; both
//   existing test files already set the secret explicitly.
// - JWT_EXPIRES_IN is required in every environment, including test, and must
//   match a value the `jsonwebtoken` / `ms` parser accepts. Validated at
//   module load so misconfiguration fails fast, not at first signing call.
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN_RAW = process.env.JWT_EXPIRES_IN;
const ENV = process.env.NODE_ENV;

if (!JWT_SECRET) {
  if (ENV === "test") {
    console.warn("JWT_SECRET not set — using insecure test fallback.");
  } else {
    throw new Error(`JWT_SECRET must be set (NODE_ENV=${ENV ?? "unset"})`);
  }
}

if (!JWT_EXPIRES_IN_RAW) {
  throw new Error(`JWT_EXPIRES_IN must be set (NODE_ENV=${ENV ?? "unset"})`);
}
if (!/^\d+(ms|s|m|h|d|w|y)?$/i.test(JWT_EXPIRES_IN_RAW)) {
  throw new Error(`JWT_EXPIRES_IN has invalid format: "${JWT_EXPIRES_IN_RAW}"`);
}

const secret = JWT_SECRET || "dev-secret-not-for-production";
const expiresIn = JWT_EXPIRES_IN_RAW as jwt.SignOptions["expiresIn"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AuthRequest<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = ParsedQs>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: { id: number; email: string };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, secret) as { id: number; email: string };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(payload: { id: number; email: string }): string {
  return jwt.sign(payload, secret, { expiresIn });
}
