import React, { useState } from 'react';
import { MessageSquare, X, Send, Code, Shield } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS, ROLE_BADGES } from '../../utils/rbacPermissions';

export default function TeamChatPanel() {
  const { isChatOpen, setIsChatOpen, chatMessages, sendChatMessage, activeFile } = useWorkspace();
  const { can, currentUser } = useAuth();

  const [textInput, setTextInput] = useState('');
  const [includeSnippet, setIncludeSnippet] = useState(false);

  if (!isChatOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    let snippet = null;
    if (includeSnippet && activeFile) {
      snippet = activeFile.content.slice(0, 150) + '...';
    }

    sendChatMessage(textInput.trim(), snippet);
    setTextInput('');
    setIncludeSnippet(false);
  };

  return (
    <aside className="w-80 bg-dark-800 border-l border-gray-800/80 flex flex-col h-[calc(100vh-3.5rem)] z-20 shadow-2xl animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-dark-900/50">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
            Workspace Team Chat
          </span>
        </div>
        <button
          onClick={() => setIsChatOpen(false)}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3">
        {chatMessages.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500">
            No messages yet. Send a message to start collaboration!
          </div>
        ) : (
          chatMessages.map((msg) => {
            const badge = ROLE_BADGES[msg.userRole] || ROLE_BADGES.editor;
            const isMe = msg.userId === currentUser.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col space-y-1 ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center space-x-1.5 text-[10px] text-gray-400">
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: msg.userAvatarColor || '#8B5CF6' }}
                  >
                    {msg.userName ? msg.userName.slice(0, 2).toUpperCase() : 'US'}
                  </span>
                  <span className="font-semibold text-gray-300">{msg.userName}</span>
                  <span className={`px-1 rounded text-[9px] uppercase ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                  <span className="text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div
                  className={`p-2.5 rounded-xl text-xs max-w-[90%] space-y-1 ${
                    isMe
                      ? 'bg-brand-600 text-white rounded-tr-none'
                      : 'bg-dark-900 border border-gray-800 text-gray-200 rounded-tl-none'
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                  {msg.codeSnippet && (
                    <div className="p-2 rounded bg-black/40 border border-white/10 font-mono text-[10px] text-indigo-300 overflow-x-auto">
                      <pre>{msg.codeSnippet}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Message Input Form */}
      {can(PERMISSIONS.SEND_CHAT) ? (
        <form onSubmit={handleSubmit} className="p-3 border-t border-gray-800 bg-dark-900/60 space-y-2">
          {activeFile && (
            <label className="flex items-center space-x-1.5 text-[11px] text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSnippet}
                onChange={(e) => setIncludeSnippet(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700 text-brand-500 focus:ring-0"
              />
              <Code className="w-3 h-3 text-indigo-400" />
              <span>Attach snippet from {activeFile.name}</span>
            </label>
          )}

          <div className="flex space-x-1.5">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type message..."
              className="flex-1 px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3 border-t border-gray-800 bg-dark-900 text-center text-xs text-amber-400 font-mono">
          Chat disabled for your current role.
        </div>
      )}

    </aside>
  );
}
