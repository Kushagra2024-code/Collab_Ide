import { type Request, type Response, type NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, projectMembersTable, projectsTable } from "@workspace/db";

/**
 * Verifies that req.userId is a member of the project identified by :projectId.
 * Also allows access when the project is public (for read-only GET requests if isPublicAllowed=true).
 *
 * Place after `requireAuth`.
 */
export function requireProjectMember(isPublicAllowed = false) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const projectId = parseInt(req.params.projectId ?? req.params.id ?? "", 10);
    if (Number.isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    const userId = req.userId!;

    // Check membership
    const [member] = await db
      .select()
      .from(projectMembersTable)
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));

    if (member) {
      // Attach role so downstream handlers can use it
      (req as any).projectRole = member.role;
      next();
      return;
    }

    // Fallback: allow if project is public and caller only reads
    if (isPublicAllowed && req.method === "GET") {
      const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
      if (project?.isPublic) {
        (req as any).projectRole = "viewer";
        next();
        return;
      }
    }

    res.status(403).json({ error: "Access denied: not a project member" });
  };
}

export function requireProjectRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).projectRole as string | undefined;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: `Requires one of roles: ${roles.join(", ")}` });
      return;
    }
    next();
  };
}
