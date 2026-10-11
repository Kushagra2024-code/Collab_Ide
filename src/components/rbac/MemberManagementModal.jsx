import React, { useState, useEffect } from 'react';
import { X, Shield, Users, Check, Lock, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { ROLES, ROLE_BADGES, PERMISSIONS } from '../../utils/rbacPermissions';

export default function MemberManagementModal() {
  const { activeModal, setActiveModal, workspace } = useWorkspace();
  const { currentUser, authFetch } = useAuth();
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (activeModal === 'members') {
      fetch('/api/workspace')
        .then(res => res.json())
        .then(data => setMembers(data.members || []))
        .catch(err => console.error(err));
    }
  }, [activeModal]);

  if (activeModal !== 'members') return null;

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await authFetch(`/api/workspace/members/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ newRole })
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: newRole } : m));
        alert(`Successfully updated role to ${newRole.toUpperCase()}`);
      } else {
        alert(data.error || 'Failed to update role');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isOwnerOrAdmin = currentUser.role === ROLES.OWNER || currentUser.role === ROLES.ADMIN;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/60">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-gray-100">Team Members & Role-Based Access (RBAC)</h2>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          
          {!isOwnerOrAdmin && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center space-x-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>You are viewing member list with {currentUser.role.toUpperCase()} permissions. Only Owners and Admins can modify roles.</span>
            </div>
          )}

          {/* Members List Table */}
          <div className="bg-dark-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-dark-900/80 border-b border-gray-800 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Workspace Collaborators</span>
              <span className="text-xs text-gray-500">{members.length} Members</span>
            </div>

            <div className="divide-y divide-gray-800/80">
              {members.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">No members found in workspace.</div>
              ) : (
                members.map((user) => {
                  const badge = ROLE_BADGES[user.role] || ROLE_BADGES.editor;

                  return (
                    <div key={user.userId || user.id} className="p-3 flex items-center justify-between hover:bg-gray-800/40 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
                          style={{ backgroundColor: user.avatarColor || '#8B5CF6' }}
                        >
                          {user.initials || 'US'}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-gray-200">{user.name}</span>
                            {user.userId === currentUser.id && (
                              <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.2 rounded font-mono">You</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">{user.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {isOwnerOrAdmin && user.role !== ROLES.OWNER ? (
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.userId || user.id, e.target.value)}
                            className="bg-gray-800 text-xs text-gray-200 px-2 py-1 rounded-lg border border-gray-700 focus:outline-none focus:border-brand-500 font-medium"
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RBAC Permissions Matrix Reference */}
          <div className="bg-dark-900 rounded-xl border border-gray-800 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center space-x-2">
              <Shield className="w-4 h-4 text-brand-400" />
              <span>Role Permissions Matrix</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-dark-800 text-gray-400 text-[10px] uppercase font-mono">
                  <tr>
                    <th className="p-2">Permission Capability</th>
                    <th className="p-2 text-center text-pink-400">Owner</th>
                    <th className="p-2 text-center text-purple-400">Admin</th>
                    <th className="p-2 text-center text-emerald-400">Editor</th>
                    <th className="p-2 text-center text-amber-400">Viewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/80">
                  <tr>
                    <td className="p-2">Edit Code & Sync Files</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                  </tr>
                  <tr>
                    <td className="p-2">Create New Files & Folders</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                  </tr>
                  <tr>
                    <td className="p-2">Delete Workspace Items</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                  </tr>
                  <tr>
                    <td className="p-2">Manage Member Roles & RBAC</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                  </tr>
                  <tr>
                    <td className="p-2">Restore File Version Snapshots</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-emerald-400">✓</td>
                    <td className="p-2 text-center text-gray-600">✕</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
