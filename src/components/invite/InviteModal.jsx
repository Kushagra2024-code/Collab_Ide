import React, { useState } from 'react';
import { X, Share2, Copy, Check, ShieldCheck, Link2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function InviteModal({ isOpen, onClose }) {
  const { workspace } = useWorkspace();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const inviteCode = workspace?.inviteCode || 'COLLAB-ALPHA-2026';
  const inviteUrl = `http://localhost:3000?invite=${inviteCode}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/80">
          <div className="flex items-center space-x-2">
            <Share2 className="w-5 h-5 text-brand-400" />
            <h2 className="text-sm font-bold text-white">Invite Collaborators</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-300 leading-relaxed">
            Share this invite link with your engineering team to collaborate on <span className="font-bold text-white">{workspace?.name || 'Workspace'}</span> in real-time.
          </p>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Shareable Invite Link</label>
            <div className="flex space-x-1.5">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-3 py-2 bg-dark-900 border border-gray-700 rounded-xl text-xs text-brand-400 font-mono focus:outline-none"
              />
              <button
                onClick={copyLink}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-dark-900 border border-gray-800 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-gray-400">Invite Code:</span>
            </div>
            <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-gray-800 border border-gray-700">
              {inviteCode}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
