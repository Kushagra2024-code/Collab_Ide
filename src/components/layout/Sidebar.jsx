import React, { useState } from 'react';
import {
  FileCode,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
  Code2,
  FileText,
  Circle,
  MoreVertical,
  Check,
  X
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/rbacPermissions';

// Recursive Tree Node Item Component
function TreeNode({ item, level = 0, selectedParentId, setSelectedParentId }) {
  const {
    files,
    activeFileId,
    openFile,
    createFile,
    createFolder,
    renameItem,
    deleteItem
  } = useWorkspace();
  const { can } = useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);

  const isFolder = item.type === 'folder';
  const isActive = item.id === activeFileId;
  const isSelectedParent = item.id === selectedParentId;

  const childItems = files.filter(f => f.parentId === item.id || (item.id === 'root' && !f.parentId));

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (renameValue.trim() && renameValue.trim() !== item.name) {
      renameItem(item.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const getLanguageIcon = (filename) => {
    if (filename.endsWith('.py')) return <Code2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (filename.endsWith('.jsx') || filename.endsWith('.js')) return <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    if (filename.endsWith('.md')) return <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    return <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
  };

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
          isActive
            ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30 font-semibold'
            : isSelectedParent
            ? 'bg-gray-800/80 text-brand-400'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
            setSelectedParentId(item.id);
          } else {
            openFile(item.id);
          }
        }}
      >
        <div className="flex items-center space-x-1.5 truncate flex-1">
          {isFolder ? (
            <>
              {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
              {isOpen ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" /> : <Folder className="w-4 h-4 text-amber-400 shrink-0" />}
            </>
          ) : (
            getLanguageIcon(item.name)
          )}

          {isRenaming ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center space-x-1 flex-1" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="w-full px-1.5 py-0.5 bg-gray-900 border border-brand-500 text-white rounded text-xs focus:outline-none"
              />
              <button type="submit" className="p-0.5 text-emerald-400 hover:text-white"><Check className="w-3 h-3" /></button>
              <button type="button" onClick={() => setIsRenaming(false)} className="p-0.5 text-gray-400 hover:text-white"><X className="w-3 h-3" /></button>
            </form>
          ) : (
            <span className="truncate">{item.name}</span>
          )}
        </div>

        {/* Hover Actions: Rename & Delete */}
        {!isRenaming && can(PERMISSIONS.CREATE_FILE) && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
              title="Rename"
              className="p-0.5 text-gray-500 hover:text-brand-400 transition-colors"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete ${item.name}${isFolder ? ' and all nested contents' : ''}?`)) {
                  deleteItem(item.id);
                }
              }}
              title="Delete"
              className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children Nodes */}
      {isFolder && isOpen && (
        <div className="space-y-0.5">
          {childItems.map(child => (
            <TreeNode
              key={child.id}
              item={child}
              level={level + 1}
              selectedParentId={selectedParentId}
              setSelectedParentId={setSelectedParentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const {
    files,
    createFile,
    createFolder,
    onlineCollaborators
  } = useWorkspace();

  const { can } = useAuth();

  const [selectedParentId, setSelectedParentId] = useState(null);
  const [createMode, setCreateMode] = useState(null); // 'file', 'folder'
  const [newItemName, setNewItemName] = useState('');

  const rootItems = files.filter(f => !f.parentId);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    if (createMode === 'folder') {
      createFolder(newItemName.trim(), selectedParentId);
    } else {
      createFile(newItemName.trim(), selectedParentId);
    }

    setNewItemName('');
    setCreateMode(null);
  };

  const selectedParent = files.find(f => f.id === selectedParentId);

  return (
    <aside className="w-64 bg-dark-800/90 border-r border-gray-800/80 flex flex-col h-[calc(100vh-3.5rem)] select-none">
      
      {/* Sidebar Header */}
      <div className="p-3 border-b border-gray-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Folder className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
            Explorer
          </span>
        </div>

        {can(PERMISSIONS.CREATE_FILE) ? (
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCreateMode('file')}
              title="New File"
              className="p-1 rounded hover:bg-gray-700/80 text-gray-400 hover:text-white transition-colors"
            >
              <FilePlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCreateMode('folder')}
              title="New Folder"
              className="p-1 rounded hover:bg-gray-700/80 text-gray-400 hover:text-white transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span title="Viewers cannot create items" className="text-[10px] text-amber-400/80 font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
            READ ONLY
          </span>
        )}
      </div>

      {/* Creation Modal / Form */}
      {createMode && (
        <form onSubmit={handleCreateSubmit} className="p-2.5 bg-dark-900 border-b border-gray-800 space-y-2">
          <div className="text-[10px] uppercase font-bold text-brand-400 flex items-center space-x-1">
            <span>New {createMode === 'folder' ? 'Folder' : 'File'} in:</span>
            <span className="text-white font-mono">{selectedParent ? selectedParent.name : 'root'}</span>
          </div>
          <input
            type="text"
            placeholder={createMode === 'folder' ? 'folder-name' : 'filename.py'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            autoFocus
            className="w-full px-2 py-1 bg-gray-800 text-xs text-white rounded border border-gray-700 focus:outline-none focus:border-brand-500 font-mono"
          />
          <div className="flex justify-end space-x-1 text-xs">
            <button
              type="button"
              onClick={() => setCreateMode(null)}
              className="px-2 py-0.5 text-[11px] text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-2.5 py-0.5 text-[11px] bg-brand-600 text-white rounded font-medium hover:bg-brand-500"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Nested Tree List */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {rootItems.map(item => (
          <TreeNode
            key={item.id}
            item={item}
            level={0}
            selectedParentId={selectedParentId}
            setSelectedParentId={setSelectedParentId}
          />
        ))}
      </div>

      {/* Active Team Footer */}
      <div className="p-3 border-t border-gray-800/80 bg-dark-900/50">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          <span>Active Team</span>
          <span className="text-emerald-400">{onlineCollaborators.length || 1} online</span>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {onlineCollaborators.map((collab, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-gray-800/50">
              <div className="flex items-center space-x-2">
                <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
                <span className="text-gray-200 font-medium truncate max-w-[110px]">
                  {collab.userName}
                </span>
              </div>
              <span className="text-[10px] px-1 py-0.2 rounded bg-gray-800 text-gray-400 uppercase font-mono">
                {collab.userRole}
              </span>
            </div>
          ))}
        </div>
      </div>

    </aside>
  );
}
