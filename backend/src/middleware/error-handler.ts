import { Request, Response, NextFunction } from "express";
import { HttpError } from "../errors/http.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
  }
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
}
