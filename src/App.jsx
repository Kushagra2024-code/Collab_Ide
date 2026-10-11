import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';

import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import TabBar from './components/editor/TabBar';
import CodeEditor from './components/editor/CodeEditor';
import TerminalPanel from './components/terminal/TerminalPanel';
import AIAssistantPanel from './components/ai/AIAssistantPanel';
import TeamChatPanel from './components/chat/TeamChatPanel';

import MemberManagementModal from './components/rbac/MemberManagementModal';
import ActivityLogModal from './components/audit/ActivityLogModal';
import VersionHistoryModal from './components/versioning/VersionHistoryModal';
import DiffViewerModal from './components/editor/DiffViewerModal';

import AuthModal from './components/auth/AuthModal';
import InlineCommentsModal from './components/comments/InlineCommentsModal';
import QuickSearchModal from './components/search/QuickSearchModal';
import InviteModal from './components/invite/InviteModal';

export default function App() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  // Keyboard shortcut for Ctrl+K global search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <div className="h-screen w-screen flex flex-col bg-dark-900 text-gray-100 font-sans overflow-hidden">
          
          {/* Top Navigation Bar */}
          <Navbar
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenInvite={() => setIsInviteOpen(true)}
            onOpenComments={() => setIsCommentsOpen(true)}
          />

          {/* Main Workspace Layout */}
          <div className="flex-1 flex overflow-hidden relative">
            
            {/* Left Sidebar */}
            <Sidebar />

            {/* Central Editor & Interactive Terminal Area */}
            <main className="flex-1 flex flex-col overflow-hidden bg-dark-900">
              <TabBar />
              <div className="flex-1 flex flex-col overflow-hidden relative">
                <CodeEditor />
                <TerminalPanel />
              </div>
            </main>

            {/* Right Drawers */}
            <AIAssistantPanel />
            <TeamChatPanel />

          </div>

          {/* Modals */}
          <MemberManagementModal />
          <ActivityLogModal />
          <VersionHistoryModal />
          <DiffViewerModal />

          <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
          <InlineCommentsModal isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} />
          <QuickSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
          <InviteModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} />

        </div>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
