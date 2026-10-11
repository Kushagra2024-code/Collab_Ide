import React from 'react';
import { X, Diff, RotateCcw } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';

export default function DiffViewerModal() {
  const {
    activeModal,
    setActiveModal,
    activeFile,
    diffTarget
  } = useWorkspace();

  const { can, currentUser } = useAuth();

  if (activeModal !== 'diff' || !diffTarget || !activeFile) return null;

  const handleRestore = async () => {
    if (!can(PERMISSIONS.RESTORE_VERSION)) {
      alert('Permission denied: Viewers cannot restore version snapshots.');
      return;
    }

    if (!confirm(`Restore ${activeFile.name} to Version ${diffTarget.versionNumber}?`)) return;

    try {
      const res = await fetch(`/api/files/${activeFile.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: diffTarget.id,
          userId: currentUser.id
        })
      });
      if (res.ok) {
        alert('File successfully restored!');
        setActiveModal(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/80">
          <div className="flex items-center space-x-3">
            <Diff className="w-5 h-5 text-brand-400" />
            <div>
              <h2 className="text-sm font-bold text-gray-100 flex items-center space-x-2">
                <span>Diff Comparison: Version {diffTarget.versionNumber} vs Current</span>
                <span className="text-xs font-mono text-brand-400">({activeFile.name})</span>
              </h2>
              <p className="text-xs text-gray-400">
                Author: {diffTarget.authorName} • {new Date(diffTarget.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {can(PERMISSIONS.RESTORE_VERSION) && (
              <button
                onClick={handleRestore}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore This Version</span>
              </button>
            )}

            <button
              onClick={() => setActiveModal('versions')}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Diff Labels */}
        <div className="grid grid-cols-2 bg-dark-900 text-xs font-mono text-gray-400 border-b border-gray-800 px-4 py-1.5">
          <div>◄ Snapshot (v{diffTarget.versionNumber})</div>
          <div>► Current Version (Live)</div>
        </div>

        {/* Monaco Diff Editor Engine */}
        <div className="flex-1 relative bg-dark-900">
          <DiffEditor
            height="100%"
            language={activeFile.language}
            original={diffTarget.content}
            modified={activeFile.content}
            theme="vs-dark"
            options={{
              readOnly: true,
              fontSize: 13,
              fontFamily: "'Fira Code', 'Consolas', monospace",
              renderSideBySide: true,
              automaticLayout: true
            }}
          />
        </div>

      </div>
    </div>
  );
}
