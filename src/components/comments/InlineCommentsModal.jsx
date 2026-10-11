import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Send, CheckCircle2, CornerDownRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';

export default function InlineCommentsModal({ isOpen, onClose }) {
  const { activeFile } = useWorkspace();
  const { currentUser, can } = useAuth();

  const [comments, setComments] = useState([]);
  const [targetLine, setTargetLine] = useState(1);
  const [newCommentText, setNewCommentText] = useState('');

  useEffect(() => {
    if (isOpen && activeFile) {
      fetch(`/api/comments/${activeFile.id}`)
        .then(res => res.json())
        .then(data => setComments(data))
        .catch(err => console.error(err));
    }
  }, [isOpen, activeFile]);

  if (!isOpen || !activeFile) return null;

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const res = await fetch(`/api/comments/${activeFile.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: Number(targetLine),
          text: newCommentText.trim(),
          author: currentUser.name,
          authorRole: currentUser.role
        })
      });
      const data = await res.json();
      if (res.ok) {
        setComments(prev => [...prev, data]);
        setNewCommentText('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/80">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-brand-400" />
            <h2 className="text-sm font-bold text-white">
              Inline Code Discussions — <span className="font-mono text-brand-400">{activeFile.name}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comment Stream */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              No inline comments on {activeFile.name} yet. Add a comment to start a line-level code review!
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="p-3 bg-dark-900 border border-gray-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono font-bold text-[10px] border border-brand-500/30">
                      Line {c.line}
                    </span>
                    <span className="font-semibold text-gray-200">{c.author}</span>
                    <span className="text-[10px] uppercase text-gray-500">({c.authorRole})</span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-gray-300 pl-2 border-l-2 border-brand-500">{c.text}</p>
              </div>
            ))
          )}
        </div>

        {/* New Comment Input Form */}
        {can(PERMISSIONS.ADD_COMMENTS) && (
          <form onSubmit={handleAddComment} className="p-3 border-t border-gray-800 bg-dark-900 space-y-2">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-gray-400 font-medium">Attach to Line #:</span>
              <input
                type="number"
                min="1"
                max="500"
                value={targetLine}
                onChange={(e) => setTargetLine(e.target.value)}
                className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white font-mono"
              />
            </div>
            <div className="flex space-x-1.5">
              <input
                type="text"
                required
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write inline comment..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
