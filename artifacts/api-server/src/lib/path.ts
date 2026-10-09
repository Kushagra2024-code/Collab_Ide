import path from "path";

/**
 * Safely resolves and joins paths relative to a base directory.
 * Prevents path traversal attacks (e.g. `../../etc/passwd`).
 * Throws an error if the resulting path escapes the base directory.
 */
export function safeJoin(baseDir: string, ...targetPaths: string[]): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...targetPaths);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal attempt detected: ${targetPaths.join("/")}`);
  }

  return resolvedTarget;
}
