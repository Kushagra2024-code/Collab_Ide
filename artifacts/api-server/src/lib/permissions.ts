export type Role = "owner" | "admin" | "editor" | "viewer";

export type Permission =
  | "read"
  | "write"
  | "delete"
  | "rename"
  | "terminal"
  | "run"
  | "env_vars"
  | "install_packages"
  | "invite_users"
  | "remove_users"
  | "manage_permissions";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "read", "write", "delete", "rename", "terminal", "run",
    "env_vars", "install_packages", "invite_users", "remove_users", "manage_permissions",
  ],
  admin: [
    "read", "write", "delete", "rename", "terminal", "run",
    "env_vars", "install_packages", "invite_users", "remove_users",
  ],
  editor: ["read", "write", "delete", "rename", "terminal", "run"],
  viewer: ["read"],
};

export function getPermissionsForRole(role: string): Permission[] {
  return [...(ROLE_PERMISSIONS[role as Role] ?? ROLE_PERMISSIONS.viewer)];
}

export function hasPermission(role: string, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function canWrite(role: string): boolean {
  return hasPermission(role, "write");
}

export function canDelete(role: string): boolean {
  return hasPermission(role, "delete");
}

export function canUseTerminal(role: string): boolean {
  return hasPermission(role, "terminal");
}

export function canRunProject(role: string): boolean {
  return hasPermission(role, "run");
}

export function canInviteUsers(role: string): boolean {
  return hasPermission(role, "invite_users");
}

export function canManagePermissions(role: string): boolean {
  return hasPermission(role, "manage_permissions");
}
