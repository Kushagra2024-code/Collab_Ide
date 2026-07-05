import { type Request, type Response, type NextFunction } from "express";
import { type Permission, hasPermission } from "../lib/permissions";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).projectRole as string | undefined;
    if (!role) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    for (const perm of permissions) {
      if (!hasPermission(role, perm)) {
        res.status(403).json({ error: `Missing permission: ${perm}` });
        return;
      }
    }
    next();
  };
}
