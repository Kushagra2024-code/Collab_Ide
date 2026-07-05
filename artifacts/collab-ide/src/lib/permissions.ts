export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export type Permission =
  | 'read' | 'write' | 'delete' | 'rename' | 'terminal' | 'run'
  | 'env_vars' | 'install_packages' | 'invite_users' | 'remove_users' | 'manage_permissions';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['read', 'write', 'delete', 'rename', 'terminal', 'run', 'env_vars', 'install_packages', 'invite_users', 'remove_users', 'manage_permissions'],
  admin: ['read', 'write', 'delete', 'rename', 'terminal', 'run', 'env_vars', 'install_packages', 'invite_users', 'remove_users'],
  editor: ['read', 'write', 'delete', 'rename', 'terminal', 'run'],
  viewer: ['read'],
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role as Role] ?? ROLE_PERMISSIONS.viewer).includes(permission);
}

export function canWrite(role: string | null | undefined): boolean {
  return hasPermission(role, 'write');
}
