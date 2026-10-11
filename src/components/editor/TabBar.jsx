import React from 'react';
import { X, Save, FileCode, Code2, FileText } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';

export default function TabBar() {
  const {
    files,
    activeFileId,
    openTabIds,
    openFile,
    closeTab,
    saveFile,
    activeFile
  } = useWorkspace();

  const { can } = useAuth();

  if (openTabIds.length === 0) return null;

  const getLanguageIcon = (filename) => {
    if (!filename) return null;
    if (filename.endsWith('.py')) return <Code2 className="w-3.5 h-3.5 text-emerald-400" />;
    if (filename.endsWith('.jsx') || filename.endsWith('.js')) return <FileCode className="w-3.5 h-3.5 text-amber-400" />;
    if (filename.endsWith('.md')) return <FileText className="w-3.5 h-3.5 text-sky-400" />;
    return <FileCode className="w-3.5 h-3.5 text-indigo-400" />;
  };

  return (
    <div className="h-10 bg-dark-900 border-b border-gray-800/80 flex items-center justify-between px-2 overflow-x-auto select-none">
      <div className="flex items-center space-x-1 overflow-x-auto">
        {openTabIds.map((fileId) => {
          const file = files.find(f => f.id === fileId);
          if (!file) return null;

          const isActive = fileId === activeFileId;

          return (
            <div
              key={fileId}
              onClick={() => openFile(fileId)}
              className={`group h-8 px-3 flex items-center space-x-2 rounded-t-lg text-xs font-mono cursor-pointer border-t-2 transition-all ${
                isActive
                  ? 'bg-dark-800 text-brand-300 border-brand-500 font-semibold shadow-sm'
                  : 'bg-dark-900/80 text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              {getLanguageIcon(file.name)}
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(fileId);
                }}
                className="p-0.5 rounded hover:bg-gray-700/80 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Save Button for active file */}
      {activeFile && (
        <div className="flex items-center space-x-2 pr-2">
          {can(PERMISSIONS.EDIT_CODE) ? (
            <button
              onClick={() => saveFile(activeFile.id, 'Manual save snapshot')}
              className="px-2.5 py-1 rounded bg-brand-600/20 text-brand-400 border border-brand-500/30 hover:bg-brand-600 hover:text-white flex items-center space-x-1 text-xs font-medium transition-colors"
              title="Save File & Create Version Snapshot (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>
          ) : (
            <span className="text-[10px] text-amber-400/90 font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              Read-Only Mode
            </span>
          )}
        </div>
      )}
    </div>
  );
}
