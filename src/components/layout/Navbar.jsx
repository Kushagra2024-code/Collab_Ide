import React, { useState } from 'react';
import {
  Sparkles,
  MessageSquare,
  History,
  Users,
  Shield,
  Activity,
  Layers,
  ChevronDown,
  Circle,
  Search,
  Share2,
  LogOut,
  User,
  MessageSquareCode,
  LogIn
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function Navbar({
  onOpenAuth,
  onOpenSearch,
  onOpenInvite,
  onOpenComments
}) {
  const { currentUser, token, logout, roleBadge } = useAuth();
  const {
    workspace,
    onlineCollaborators,
    isAiOpen,
    setIsAiOpen,
    isChatOpen,
    setIsChatOpen,
    setActiveModal
  } = useWorkspace();

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header className="h-14 bg-dark-800 border-b border-gray-800/80 px-4 flex items-center justify-between selection:bg-brand-500 z-30 relative">
      {/* Left section: Logo & Workspace Info */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 via-brand-500 to-brand-accent flex items-center justify-center shadow-lg shadow-brand-500/20">
            <span className="text-white text-lg font-bold">⚡</span>
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-gray-200 to-brand-400 bg-clip-text text-transparent">
            Collab IDE
          </span>
        </div>

        <div className="h-4 w-px bg-gray-700/60 hidden sm:block" />

        <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-300">
          <Layers className="w-4 h-4 text-brand-400" />
          <span className="font-medium">{workspace?.name || 'Production Workspace'}</span>
          <button
            onClick={onOpenInvite}
            className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-brand-500 transition-colors flex items-center space-x-1"
          >
            <Share2 className="w-3 h-3 text-brand-400" />
            <span>Invite</span>
          </button>
        </div>
      </div>

      {/* Center section: Online Collaborator Presence */}
      <div className="hidden md:flex items-center space-x-2 bg-dark-900/60 px-3 py-1.5 rounded-full border border-gray-800">
        <div className="flex items-center space-x-1">
          <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-gray-300">
            {onlineCollaborators.length > 0 ? onlineCollaborators.length : 1} Active Now
          </span>
        </div>
        <div className="flex -space-x-1.5 overflow-hidden">
          {onlineCollaborators.map((collab, i) => (
            <div
              key={i}
              title={`${collab.userName} (${collab.userRole.toUpperCase()})`}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-dark-800 transition-transform hover:scale-110 ring-2 ring-emerald-500/50"
              style={{ backgroundColor: collab.userAvatarColor || '#8B5CF6' }}
            >
              {collab.userName ? collab.userName.slice(0, 2).toUpperCase() : 'US'}
            </div>
          ))}
        </div>
      </div>

      {/* Right section: Global Controls & Auth */}
      <div className="flex items-center space-x-2">

        {/* Global Quick Search (Ctrl+K) */}
        <button
          onClick={onOpenSearch}
          className="px-2.5 py-1.5 rounded-lg bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800 flex items-center space-x-1.5 text-xs"
          title="Quick Open / Global Search (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden lg:inline">Search...</span>
          <kbd className="hidden lg:inline text-[9px] px-1 bg-gray-800 rounded border border-gray-700 font-mono">⌘K</kbd>
        </button>

        {/* Inline Comments Trigger */}
        <button
          onClick={onOpenComments}
          title="Line-Level Code Comments"
          className="p-2 rounded-lg bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800"
        >
          <MessageSquareCode className="w-4 h-4 text-indigo-400" />
        </button>

        {/* Activity Audit Log Trigger */}
        <button
          onClick={() => setActiveModal('activity')}
          title="Activity Audit Log"
          className="p-2 rounded-lg bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800"
        >
          <Activity className="w-4 h-4 text-sky-400" />
        </button>

        {/* Version History Trigger */}
        <button
          onClick={() => setActiveModal('versions')}
          title="Version History & Diff Viewer"
          className="p-2 rounded-lg bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800"
        >
          <History className="w-4 h-4 text-emerald-400" />
        </button>

        {/* RBAC Member Management */}
        <button
          onClick={() => setActiveModal('members')}
          title="Manage Team Members & Permissions"
          className="p-2 rounded-lg bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800"
        >
          <Users className="w-4 h-4 text-purple-400" />
        </button>

        {/* Team Chat Drawer Toggle */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`p-2 rounded-lg transition-colors border ${isChatOpen ? 'bg-brand-500/20 text-brand-400 border-brand-500/40' : 'bg-dark-900 text-gray-400 hover:text-white hover:bg-gray-800 border-gray-800'}`}
          title="Team Chat"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* AI Assistant Drawer Toggle */}
        <button
          onClick={() => setIsAiOpen(!isAiOpen)}
          className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 text-xs font-medium transition-all shadow-md ${isAiOpen ? 'bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-brand-500/30' : 'bg-dark-900 text-brand-400 border border-brand-500/30 hover:border-brand-500'}`}
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>

        <div className="h-4 w-px bg-gray-700/60" />

        {/* Real User Profile / Authentication Control */}
        {token ? (
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-dark-900 border border-gray-700 hover:border-brand-500 transition-colors"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                style={{ backgroundColor: currentUser.avatarColor || '#EC4899' }}
              >
                {currentUser.initials || 'US'}
              </div>
              <span className="text-xs font-medium text-gray-200 hidden lg:inline">{currentUser.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border} uppercase font-bold`}>
                {roleBadge.label}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-1 w-56 glass-dropdown rounded-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="px-3 py-2 border-b border-gray-800">
                  <p className="text-xs font-bold text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-gray-400">{currentUser.email}</p>
                  <span className="mt-1 inline-block text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                    ● Session Active (JWT Verified)
                  </span>
                </div>

                <button
                  onClick={() => { setIsProfileOpen(false); logout(); }}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-gray-800/80 font-medium flex items-center space-x-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}

      </div>
    </header>
  );
}
