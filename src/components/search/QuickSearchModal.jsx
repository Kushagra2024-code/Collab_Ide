import React, { useState } from 'react';
import { X, Search, FileCode, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function QuickSearchModal({ isOpen, onClose }) {
  const { files, openFile } = useWorkspace();
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const matches = files.filter(f => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return f.name.toLowerCase().includes(q) ||
           f.path.toLowerCase().includes(q) ||
           f.content.toLowerCase().includes(q);
  });

  const handleSelect = (fileId) => {
    openFile(fileId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-start justify-center pt-20 z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Search Input Bar */}
        <div className="p-3 border-b border-gray-800 flex items-center space-x-3 bg-dark-900">
          <Search className="w-5 h-5 text-brand-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace files or code text (e.g. server.js, socket, import)..."
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {matches.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No matching files or code blocks found for "{query}".
            </div>
          ) : (
            matches.map((file) => (
              <div
                key={file.id}
                onClick={() => handleSelect(file.id)}
                className="p-3 rounded-xl hover:bg-gray-800/80 transition-colors cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-dark-900 border border-gray-700 text-brand-400 group-hover:border-brand-500">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-200 block">{file.name}</span>
                    <span className="text-[10px] font-mono text-gray-500">{file.path}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                    {file.language}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-brand-400 transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
