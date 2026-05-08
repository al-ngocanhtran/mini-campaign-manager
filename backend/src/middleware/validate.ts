import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { ValidationError } from "../errors/http.js";
import { fieldErrors } from "../validation/errors.js";

type Source = "body" | "params" | "query";

export function validate(schema: ZodTypeAny, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) throw new ValidationError(fieldErrors(parsed.error));
    (req as Request & Record<Source, unknown>)[source] = parsed.data;
    next();
  };
}
