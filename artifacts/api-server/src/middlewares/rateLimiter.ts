import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Simple in-process rate limiter.
 * For multi-instance deployments, replace with Redis-backed limiter.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function createLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path.split("/")[1] ?? "root"}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.status(429).json({
        error: "Too many requests",
        retryAfter,
      });
      logger.warn({ key, ip: req.ip, path: req.path }, "Rate limit exceeded");
      return;
    }

    entry.count++;
    next();
  };
}

/** 5 requests per minute — for auth endpoints */
export const authRateLimiter = createLimiter(5, 60_000);

/** 20 requests per minute — for AI endpoints (expensive) */
export const aiRateLimiter = createLimiter(20, 60_000);

/** 60 requests per minute — for file operations */
export const fileRateLimiter = createLimiter(60, 60_000);

/** 30 requests per minute — generic API */
export const generalRateLimiter = createLimiter(30, 60_000);

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60_000);
