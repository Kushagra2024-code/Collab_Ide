import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext();

export function WorkspaceProvider({ children }) {
  const { currentUser, authFetch } = useAuth();

  const [socket, setSocket] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [openTabIds, setOpenTabIds] = useState([]);

  // Collaborator presence & cursor states
  const [onlineCollaborators, setOnlineCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});

  // Feature drawers & modals state
  const [chatMessages, setChatMessages] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // 'members', 'activity', 'versions', 'diff'
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [diffTarget, setDiffTarget] = useState(null);

  // Fetch initial workspace data
  useEffect(() => {
    fetch('/api/workspace')
      .then(res => res.json())
      .then(data => setWorkspace(data))
      .catch(err => console.error('Error fetching workspace:', err));

    fetch('/api/files')
      .then(res => res.json())
      .then(data => {
        setFiles(data);
        const firstFile = data.find(f => f.type !== 'folder');
        if (firstFile) {
          setActiveFileId(firstFile.id);
          setOpenTabIds([firstFile.id]);
        }
      })
      .catch(err => console.error('Error fetching files:', err));

    fetch('/api/chat')
      .then(res => res.json())
      .then(data => setChatMessages(data))
      .catch(err => console.error('Error fetching chat:', err));

    fetch('/api/activity')
      .then(res => res.json())
      .then(data => setActivityLogs(data))
      .catch(err => console.error('Error fetching activity:', err));
  }, []);

  // Initialize Socket Connection
  useEffect(() => {
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket', 'polling']
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_workspace', {
        user: currentUser,
        workspaceId: 'ws_prod'
      });
    });

    newSocket.on('presence_update', (users) => {
      setOnlineCollaborators(users);
    });

    newSocket.on('code_sync', ({ fileId, content }) => {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content, updatedAt: new Date().toISOString() } : f));
    });

    newSocket.on('cursor_sync', (cursorData) => {
      setRemoteCursors(prev => ({
        ...prev,
        [cursorData.userId]: cursorData
      }));
    });

    newSocket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    newSocket.on('activity_logged', (log) => {
      setActivityLogs(prev => [log, ...prev]);
    });

    newSocket.on('file_created', (newItem) => {
      setFiles(prev => [...prev, newItem]);
    });

    newSocket.on('file_updated', (updatedFile) => {
      setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    });

    newSocket.on('files_reordered', (updatedFilesList) => {
      setFiles(updatedFilesList);
    });

    newSocket.on('file_deleted', ({ id }) => {
      setFiles(prev => prev.filter(f => f.id !== id));
      setOpenTabIds(prev => prev.filter(tabId => tabId !== id));
    });

    return () => {
      newSocket.disconnect();
    };
  }, [currentUser.id]);

  // Tab & File actions
  const openFile = (fileId) => {
    const item = files.find(f => f.id === fileId);
    if (!item || item.type === 'folder') return;

    setActiveFileId(fileId);
    if (!openTabIds.includes(fileId)) {
      setOpenTabIds(prev => [...prev, fileId]);
    }
  };

  const closeTab = (fileId) => {
    const newTabs = openTabIds.filter(id => id !== fileId);
    setOpenTabIds(newTabs);
    if (activeFileId === fileId) {
      setActiveFileId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
    }
  };

  const updateFileContent = (fileId, newContent) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: newContent } : f));
    if (socket) {
      socket.emit('code_change', {
        fileId,
        content: newContent,
        userId: currentUser.id,
        userName: currentUser.name
      });
    }
  };

  const saveFile = async (fileId, commitMessage = '') => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    try {
      const res = await authFetch(`/api/files/${fileId}`, {
        method: 'PUT',
        body: JSON.stringify({
          content: file.content,
          language: file.language,
          commitMessage
        })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to save file');
      }
    } catch (err) {
      console.error('Save file error:', err);
    }
  };

  const createFile = async (name, parentId = null) => {
    try {
      const res = await authFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({
          name,
          isFolder: false,
          parentId
        })
      });
      const data = await res.json();
      if (res.ok) {
        openFile(data.id);
      } else {
        alert(data.error || 'Failed to create file');
      }
    } catch (err) {
      console.error('Create file error:', err);
    }
  };

  const createFolder = async (name, parentId = null) => {
    try {
      const res = await authFetch('/api/files', {
        method: 'POST',
        body: JSON.stringify({
          name,
          isFolder: true,
          parentId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to create folder');
      }
    } catch (err) {
      console.error('Create folder error:', err);
    }
  };

  const renameItem = async (id, newName) => {
    try {
      const res = await authFetch(`/api/files/${id}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ newName })
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files);
      } else {
        alert(data.error || 'Failed to rename item');
      }
    } catch (err) {
      console.error('Rename item error:', err);
    }
  };

  const deleteItem = async (id) => {
    try {
      const res = await authFetch(`/api/files/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        if (data.deletedIds) {
          setFiles(prev => prev.filter(f => !data.deletedIds.includes(f.id)));
          setOpenTabIds(prev => prev.filter(tabId => !data.deletedIds.includes(tabId)));
        }
      } else {
        alert(data.error || 'Failed to delete item');
      }
    } catch (err) {
      console.error('Delete item error:', err);
    }
  };

  const sendChatMessage = (text, codeSnippet) => {
    if (!text.trim()) return;
    authFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text, codeSnippet })
    });
  };

  const broadcastCursor = (cursor) => {
    if (socket && activeFileId) {
      socket.emit('cursor_move', {
        fileId: activeFileId,
        cursor,
        userId: currentUser.id
      });
    }
  };

  const activeFile = files.find(f => f.id === activeFileId);

  return (
    <WorkspaceContext.Provider value={{
      workspace,
      files,
      setFiles,
      activeFileId,
      activeFile,
      openTabIds,
      onlineCollaborators,
      remoteCursors,
      chatMessages,
      activityLogs,
      activeModal,
      setActiveModal,
      isAiOpen,
      setIsAiOpen,
      isChatOpen,
      setIsChatOpen,
      diffTarget,
      setDiffTarget,
      openFile,
      closeTab,
      updateFileContent,
      saveFile,
      createFile,
      createFolder,
      renameItem,
      deleteItem,
      sendChatMessage,
      broadcastCursor
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
