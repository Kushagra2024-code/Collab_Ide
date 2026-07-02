import { type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";

function isZodError(err: unknown): err is { issues: unknown[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as any).name === "ZodError" &&
    Array.isArray((err as any).issues)
  );
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (isZodError(err)) {
    res.status(422).json({ error: "Response schema mismatch", details: (err as any).issues });
    return;
  }

  // Postgres unique violation
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as any).code === "23505"
  ) {
    res.status(409).json({ error: "Duplicate entry" });
    return;
  }

  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
