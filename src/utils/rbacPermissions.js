// Role-Based Access Control (RBAC) Permissions Matrix

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer'
};

export const PERMISSIONS = {
  // File operations
  EDIT_CODE: 'EDIT_CODE',
  CREATE_FILE: 'CREATE_FILE',
  DELETE_FILE: 'DELETE_FILE',
  RESTORE_VERSION: 'RESTORE_VERSION',

  // Workspace & Member management
  MANAGE_MEMBERS: 'MANAGE_MEMBERS',
  CHANGE_ROLES: 'CHANGE_ROLES',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',

  // Chat & AI
  SEND_CHAT: 'SEND_CHAT',
  USE_AI: 'USE_AI',
  ADD_COMMENTS: 'ADD_COMMENTS'
};

const ROLE_PERMISSIONS = {
  [ROLES.OWNER]: [
    PERMISSIONS.EDIT_CODE,
    PERMISSIONS.CREATE_FILE,
    PERMISSIONS.DELETE_FILE,
    PERMISSIONS.RESTORE_VERSION,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.CHANGE_ROLES,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.SEND_CHAT,
    PERMISSIONS.USE_AI,
    PERMISSIONS.ADD_COMMENTS
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.EDIT_CODE,
    PERMISSIONS.CREATE_FILE,
    PERMISSIONS.DELETE_FILE,
    PERMISSIONS.RESTORE_VERSION,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.SEND_CHAT,
    PERMISSIONS.USE_AI,
    PERMISSIONS.ADD_COMMENTS
  ],
  [ROLES.EDITOR]: [
    PERMISSIONS.EDIT_CODE,
    PERMISSIONS.CREATE_FILE,
    PERMISSIONS.RESTORE_VERSION,
    PERMISSIONS.SEND_CHAT,
    PERMISSIONS.USE_AI,
    PERMISSIONS.ADD_COMMENTS
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.SEND_CHAT,
    PERMISSIONS.ADD_COMMENTS
  ]
};

export function hasPermission(userRole, permission) {
  if (!userRole) return false;
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

export const ROLE_BADGES = {
  owner: { label: 'Owner', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  admin: { label: 'Admin', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  editor: { label: 'Editor', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  viewer: { label: 'Viewer', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' }
};
