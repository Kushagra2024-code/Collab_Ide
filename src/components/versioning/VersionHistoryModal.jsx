import React, { useEffect, useState } from 'react';
import { X, History, GitCommit, Eye, RotateCcw, Clock, FileCode } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';

export default function VersionHistoryModal() {
  const {
    activeModal,
    setActiveModal,
    activeFile,
    setDiffTarget
  } = useWorkspace();

  const { can, currentUser } = useAuth();
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeModal === 'versions' && activeFile) {
      setIsLoading(true);
      fetch(`/api/files/${activeFile.id}/versions`)
        .then(res => res.json())
        .then(data => setVersions(data))
        .catch(err => console.error(err))
        .finally(() => setIsLoading(false));
    }
  }, [activeModal, activeFile]);

  if (activeModal !== 'versions') return null;

  const handleOpenDiff = (version) => {
    setDiffTarget(version);
    setActiveModal('diff');
  };

  const handleRestoreVersion = async (versionId) => {
    if (!can(PERMISSIONS.RESTORE_VERSION)) {
      alert('Permission denied: Viewers cannot restore file versions.');
      return;
    }

    if (!confirm('Are you sure you want to restore the file to this version snapshot?')) return;

    try {
      const res = await fetch(`/api/files/${activeFile.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          userId: currentUser.id
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('File successfully restored to snapshot!');
        setActiveModal(null);
      } else {
        alert(data.error || 'Failed to restore snapshot');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-dark-800 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-dark-900/60">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-gray-100">
              Version History — <span className="text-brand-400 font-mono">{activeFile?.name || 'File'}</span>
            </h2>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="text-center py-8 text-xs text-gray-400">Loading version snapshots...</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              No previous version snapshots saved for this file yet. Save edits to generate snapshots!
            </div>
          ) : (
            versions.map((ver) => (
              <div
                key={ver.id}
                className="p-3.5 bg-dark-900/90 border border-gray-800 rounded-xl hover:border-brand-500/40 transition-all flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 font-mono text-xs font-bold border border-brand-500/30">
                      v{ver.versionNumber}
                    </span>
                    <span className="text-sm font-semibold text-gray-200">
                      {ver.commitMessage || 'Snapshot commit'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span className="flex items-center space-x-1">
                      <GitCommit className="w-3.5 h-3.5 text-gray-400" />
                      <span>{ver.authorName}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{new Date(ver.timestamp).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenDiff(ver)}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium flex items-center space-x-1 border border-gray-700 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-brand-400" />
                    <span>View Diff</span>
                  </button>

                  {can(PERMISSIONS.RESTORE_VERSION) && (
                    <button
                      onClick={() => handleRestoreVersion(ver.id)}
                      className="px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white text-xs font-medium flex items-center space-x-1 border border-brand-500/30 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
