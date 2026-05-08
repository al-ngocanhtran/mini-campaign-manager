import { Request, Response, NextFunction } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  console.warn("JWT_SECRET not set — using insecure dev fallback. DO NOT use in production.");
}

const secret = JWT_SECRET || "dev-secret-not-for-production";

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
  return jwt.sign(payload, secret, { expiresIn: "24h" });
}
