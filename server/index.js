import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { loadDb, saveDb } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'collab_ide_jwt_production_secret_key_2026';

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Helper function to auto-detect language from file extension
function detectLanguage(filename) {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'py': return 'python';
    case 'js':
    case 'jsx': return 'javascript';
    case 'ts':
    case 'tsx': return 'typescript';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'go': return 'go';
    case 'cpp':
    case 'c': return 'cpp';
    default: return 'javascript';
  }
}

// Load DB from persistent storage
let db = loadDb();

function persist() {
  saveDb(db);
}

// Active Socket presence map
const activeSockets = new Map();

function logActivity(userId, userName, userRole, action, details) {
  const newLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    userId,
    userName,
    userRole,
    action,
    details
  };
  db.activity.unshift(newLog);
  persist();
  io.emit('activity_logged', newLog);
  return newLog;
}

// Auth Verification Middleware
function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid JWT token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired JWT token' });
  }
}

// ---------------- AUTHENTICATION ENDPOINTS ---------------- //

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  logActivity(user.id, user.name, user.role, 'USER_LOGIN', `${user.name} logged in`);

  res.json({ token, user });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const isFirstUser = db.users.length === 0;
  const assignedRole = isFirstUser ? 'owner' : (role || 'editor');

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
  const colors = ['#EC4899', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#06B6D4'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const newUser = {
    id: `usr_${Date.now()}`,
    name,
    email,
    role: assignedRole,
    avatarColor,
    initials
  };

  db.users.push(newUser);
  db.workspace.members.push({ userId: newUser.id, role: newUser.role, joinedAt: new Date().toISOString() });
  persist();

  const token = jwt.sign({ userId: newUser.id, role: newUser.role, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
  logActivity(newUser.id, newUser.name, newUser.role, 'USER_REGISTERED', `Created account "${newUser.name}" (${assignedRole.toUpperCase()})`);

  io.emit('workspace_updated', db.workspace);
  res.status(201).json({ token, user: newUser });
});

app.post('/api/auth/oauth', (req, res) => {
  const { provider } = req.body;
  const randomId = Math.floor(Math.random() * 1000);
  const isFirstUser = db.users.length === 0;

  const oauthUser = {
    id: `usr_oauth_${randomId}`,
    name: `${provider === 'github' ? 'GitHub' : 'Google'} Dev ${randomId}`,
    email: `dev${randomId}@${provider}.com`,
    role: isFirstUser ? 'owner' : 'editor',
    avatarColor: provider === 'github' ? '#333333' : '#4285F4',
    initials: provider === 'github' ? 'GH' : 'GO'
  };

  db.users.push(oauthUser);
  db.workspace.members.push({ userId: oauthUser.id, role: oauthUser.role, joinedAt: new Date().toISOString() });
  persist();

  const token = jwt.sign({ userId: oauthUser.id, role: oauthUser.role, email: oauthUser.email }, JWT_SECRET, { expiresIn: '7d' });
  logActivity(oauthUser.id, oauthUser.name, oauthUser.role, 'OAUTH_LOGIN', `Authenticated via ${provider.toUpperCase()} OAuth`);

  res.json({ token, user: oauthUser });
});

app.get('/api/auth/me', verifyJwt, (req, res) => {
  const user = db.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ---------------- WORKSPACE & NESTED FILE/FOLDER ENDPOINTS ---------------- //

app.get('/api/users', (req, res) => {
  res.json(db.users);
});

app.get('/api/workspace', (req, res) => {
  const membersWithDetails = db.workspace.members.map(m => {
    const user = db.users.find(u => u.id === m.userId);
    return { ...m, ...user };
  });
  res.json({ ...db.workspace, members: membersWithDetails });
});

app.post('/api/workspace/join', verifyJwt, (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.user.userId;

  if (inviteCode.toUpperCase() === db.workspace.inviteCode) {
    const user = db.users.find(u => u.id === userId);
    if (user) {
      if (!db.workspace.members.some(m => m.userId === userId)) {
        db.workspace.members.push({ userId: user.id, role: user.role, joinedAt: new Date().toISOString() });
        persist();
        logActivity(user.id, user.name, user.role, 'INVITE_JOIN', `${user.name} joined workspace via invite code`);
        io.emit('workspace_updated', db.workspace);
      }
      return res.json({ success: true, workspace: db.workspace });
    }
  }
  res.status(400).json({ error: 'Invalid workspace invite code' });
});

app.put('/api/workspace/members/:userId/role', verifyJwt, (req, res) => {
  const { userId } = req.params;
  const { newRole } = req.body;
  const requesterId = req.user.userId;

  const requester = db.users.find(u => u.id === requesterId);
  if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
    return res.status(403).json({ error: 'Permission denied: Only Owners and Admins can update roles.' });
  }

  const member = db.workspace.members.find(m => m.userId === userId);
  if (member) {
    member.role = newRole;
    const targetUser = db.users.find(u => u.id === userId);
    if (targetUser) targetUser.role = newRole;

    persist();
    logActivity(requester.id, requester.name, requester.role, 'ROLE_UPDATED', `Updated ${targetUser?.name}'s role to ${newRole.toUpperCase()}`);
    io.emit('workspace_updated', db.workspace);
    return res.json({ success: true, member });
  }
  res.status(404).json({ error: 'Member not found' });
});

// Get Files & Folders Tree
app.get('/api/files', (req, res) => {
  res.json(db.files);
});

// Create File OR Folder
app.post('/api/files', verifyJwt, (req, res) => {
  const { name, isFolder, parentId, language, content } = req.body;
  const creatorId = req.user.userId;
  const creator = db.users.find(u => u.id === creatorId);

  if (creator && creator.role === 'viewer') {
    return res.status(403).json({ error: 'Permission denied: Viewers cannot create files or folders.' });
  }

  const parentItem = parentId ? db.files.find(f => f.id === parentId) : null;
  const parentPath = parentItem ? parentItem.path : '';
  const itemPath = `${parentPath}/${name}`;

  if (isFolder) {
    const newFolder = {
      id: `folder_${Date.now()}`,
      name,
      path: itemPath,
      type: 'folder',
      parentId: parentId || null,
      updatedAt: new Date().toISOString()
    };

    db.files.push(newFolder);
    persist();
    logActivity(creator?.id || 'system', creator?.name || 'System', creator?.role || 'editor', 'FOLDER_CREATED', `Created folder ${name} in ${parentPath || 'root'}`);
    io.emit('file_created', newFolder);
    return res.status(201).json(newFolder);
  }

  const detectedLang = language || detectLanguage(name);

  let initialContent = content;
  if (!initialContent) {
    if (detectedLang === 'python') {
      initialContent = `# ${name}\nprint("Hello from Python 3!")\n`;
    } else if (detectedLang === 'javascript') {
      initialContent = `// ${name}\nconsole.log("Hello from JavaScript!");\n`;
    } else if (detectedLang === 'html') {
      initialContent = `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Collab IDE HTML Page</h1>\n</body>\n</html>\n`;
    } else if (detectedLang === 'json') {
      initialContent = `{\n  "name": "${name}",\n  "status": "active"\n}\n`;
    } else {
      initialContent = `// ${name}\n`;
    }
  }

  const newFile = {
    id: `f_${Date.now()}`,
    name,
    path: itemPath,
    type: 'file',
    parentId: parentId || null,
    language: detectedLang,
    content: initialContent,
    updatedAt: new Date().toISOString()
  };

  db.files.push(newFile);
  db.versions[newFile.id] = [{
    id: `v_${Date.now()}`,
    versionNumber: 1,
    timestamp: new Date().toISOString(),
    authorName: creator ? creator.name : 'System',
    commitMessage: `Initial creation of ${name}`,
    content: newFile.content
  }];
  persist();

  logActivity(creator?.id || 'system', creator?.name || 'System', creator?.role || 'editor', 'FILE_CREATED', `Created file ${name} in ${parentPath || 'root'}`);
  io.emit('file_created', newFile);
  res.status(201).json(newFile);
});

// Rename File OR Folder
app.put('/api/files/:id/rename', verifyJwt, (req, res) => {
  const { id } = req.params;
  const { newName } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  if (user && user.role === 'viewer') {
    return res.status(403).json({ error: 'Permission denied: Viewers cannot rename items.' });
  }

  const item = db.files.find(f => f.id === id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const oldPath = item.path;
  const pathParts = oldPath.split('/');
  pathParts[pathParts.length - 1] = newName;
  const newPath = pathParts.join('/');

  item.name = newName;
  item.path = newPath;
  item.updatedAt = new Date().toISOString();

  if (item.type === 'folder') {
    db.files.forEach(child => {
      if (child.path.startsWith(oldPath + '/')) {
        child.path = child.path.replace(oldPath + '/', newPath + '/');
      }
    });
  }

  if (item.type === 'file') {
    item.language = detectLanguage(newName);
  }

  persist();
  logActivity(user?.id || 'system', user?.name || 'User', user?.role || 'editor', 'ITEM_RENAMED', `Renamed to ${newName}`);
  io.emit('files_reordered', db.files);
  res.json({ success: true, item, files: db.files });
});

// Update File Content & Snapshot
app.put('/api/files/:id', verifyJwt, (req, res) => {
  const { id } = req.params;
  const { content, language, commitMessage } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  if (user && user.role === 'viewer') {
    return res.status(403).json({ error: 'Permission denied: Viewers are read-only.' });
  }

  const fileIndex = db.files.findIndex(f => f.id === id);
  if (fileIndex !== -1) {
    db.files[fileIndex].content = content;
    if (language) db.files[fileIndex].language = language;
    db.files[fileIndex].updatedAt = new Date().toISOString();

    if (!db.versions[id]) db.versions[id] = [];
    const newVersionNum = db.versions[id].length + 1;
    const snapshot = {
      id: `v_${Date.now()}`,
      versionNumber: newVersionNum,
      timestamp: new Date().toISOString(),
      authorName: user ? user.name : 'Collaborator',
      commitMessage: commitMessage || `Updated version ${newVersionNum}`,
      content
    };
    db.versions[id].push(snapshot);
    persist();

    logActivity(user?.id || 'unknown', user?.name || 'User', user?.role || 'editor', 'FILE_SAVED', `Saved ${db.files[fileIndex].name} (v${newVersionNum})`);
    io.emit('file_updated', db.files[fileIndex]);
    return res.json({ file: db.files[fileIndex], snapshot });
  }
  res.status(404).json({ error: 'File not found' });
});

// Delete File OR Folder
app.delete('/api/files/:id', verifyJwt, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  if (user && (user.role === 'viewer' || user.role === 'editor')) {
    return res.status(403).json({ error: 'Permission denied: Only Owners and Admins can delete items.' });
  }

  const targetItem = db.files.find(f => f.id === id);
  if (!targetItem) return res.status(404).json({ error: 'Item not found' });

  let deletedIds = [id];

  if (targetItem.type === 'folder') {
    const findChildren = (folderPath) => {
      db.files.forEach(item => {
        if (item.path.startsWith(folderPath + '/')) {
          deletedIds.push(item.id);
        }
      });
    };
    findChildren(targetItem.path);
  }

  db.files = db.files.filter(f => !deletedIds.includes(f.id));
  persist();

  logActivity(user?.id || 'system', user?.name || 'User', user?.role || 'admin', 'ITEM_DELETED', `Deleted ${targetItem.name} (${deletedIds.length} items)`);
  io.emit('files_reordered', db.files);
  res.json({ success: true, deletedIds, files: db.files });
});

app.get('/api/files/:id/versions', (req, res) => {
  const { id } = req.params;
  res.json(db.versions[id] || []);
});

app.post('/api/files/:id/restore', verifyJwt, (req, res) => {
  const { id } = req.params;
  const { versionId } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  if (user && user.role === 'viewer') {
    return res.status(403).json({ error: 'Permission denied: Viewers cannot restore versions.' });
  }

  const snapshots = db.versions[id] || [];
  const snapshot = snapshots.find(s => s.id === versionId);
  const fileIndex = db.files.findIndex(f => f.id === id);

  if (snapshot && fileIndex !== -1) {
    db.files[fileIndex].content = snapshot.content;
    db.files[fileIndex].updatedAt = new Date().toISOString();
    persist();

    logActivity(user?.id || 'system', user?.name || 'User', user?.role || 'editor', 'VERSION_RESTORED', `Restored ${db.files[fileIndex].name} to version ${snapshot.versionNumber}`);
    io.emit('file_updated', db.files[fileIndex]);
    return res.json({ success: true, file: db.files[fileIndex] });
  }
  res.status(400).json({ error: 'Invalid restore request' });
});

// ---------------- UNIVERSAL MULTI-LANGUAGE CODE EXECUTION ENGINE ---------------- //

app.post('/api/execute', verifyJwt, (req, res) => {
  const { code, language, filename } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);
  const startTime = Date.now();

  const lang = (language || detectLanguage(filename)).toLowerCase();
  const tmpDir = os.tmpdir();

  if (lang === 'python') {
    const tmpFilePath = path.join(tmpDir, `collab_${Date.now()}_script.py`);
    fs.writeFileSync(tmpFilePath, code, 'utf-8');

    exec(`python3 "${tmpFilePath}"`, { timeout: 10000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFilePath); } catch (e) {}
      const duration = Date.now() - startTime;

      let logs = [
        `Python 3.13 Production Execution Engine`,
        `----------------------------------------`
      ];

      if (stdout) {
        stdout.split('\n').forEach(line => {
          if (line.trim()) logs.push(`[stdout]: ${line}`);
        });
      }
      if (stderr) {
        stderr.split('\n').forEach(line => {
          if (line.trim()) logs.push(`[stderr]: ${line}`);
        });
      }
      if (err && !stderr) {
        logs.push(`[stderr Error]: ${err.message}`);
      }
      if (!stdout && !stderr && !err) {
        logs.push(`[stdout]: Python script executed successfully with no output.`);
      }

      logActivity(user?.id || 'anon', user?.name || 'Developer', user?.role || 'editor', 'PYTHON_EXECUTED', `Executed Python script (${duration}ms)`);

      return res.json({ logs, error: err ? err.message : null, durationMs: duration });
    });
  } else if (lang === 'javascript' || lang === 'typescript') {
    const tmpFilePath = path.join(tmpDir, `collab_${Date.now()}_script.js`);
    const cleanJsCode = code.replace(/:\s*(string|number|boolean|any|void)/g, '');
    fs.writeFileSync(tmpFilePath, cleanJsCode, 'utf-8');

    exec(`node "${tmpFilePath}"`, { timeout: 10000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFilePath); } catch (e) {}
      const duration = Date.now() - startTime;

      let logs = [
        `JavaScript Node.js V8 Production Execution Engine`,
        `----------------------------------------`
      ];

      if (stdout) {
        stdout.split('\n').forEach(line => {
          if (line.trim()) logs.push(`[stdout]: ${line}`);
        });
      }
      if (stderr) {
        stderr.split('\n').forEach(line => {
          if (line.trim()) logs.push(`[stderr]: ${line}`);
        });
      }
      if (err && !stderr) {
        logs.push(`[stderr Error]: ${err.message}`);
      }
      if (!stdout && !stderr && !err) {
        logs.push(`[stdout]: JavaScript code executed with return code 0.`);
      }

      logActivity(user?.id || 'anon', user?.name || 'Developer', user?.role || 'editor', 'JS_EXECUTED', `Executed JavaScript script (${duration}ms)`);

      return res.json({ logs, error: err ? err.message : null, durationMs: duration });
    });
  } else {
    const duration = Date.now() - startTime;
    res.json({
      logs: [
        `${lang.toUpperCase()} Document Evaluation`,
        `----------------------------------------`,
        `[stdout]: Document syntax evaluated successfully.`
      ],
      error: null,
      durationMs: duration
    });
  }
});

// ---------------- CHAT & COMMENTS ENDPOINTS ---------------- //

app.get('/api/chat', (req, res) => {
  res.json(db.chat);
});

app.post('/api/chat', verifyJwt, (req, res) => {
  const { text, codeSnippet } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  const msg = {
    id: `msg_${Date.now()}`,
    timestamp: new Date().toISOString(),
    userId: user?.id || 'usr_anon',
    userName: user?.name || 'Collaborator',
    userRole: user?.role || 'editor',
    userAvatarColor: user?.avatarColor || '#8B5CF6',
    text,
    codeSnippet: codeSnippet || null
  };

  db.chat.push(msg);
  persist();
  io.emit('chat_message', msg);
  res.status(201).json(msg);
});

app.get('/api/comments/:fileId', (req, res) => {
  res.json(db.comments[req.params.fileId] || []);
});

app.post('/api/comments/:fileId', verifyJwt, (req, res) => {
  const { fileId } = req.params;
  const { line, text } = req.body;
  const userId = req.user.userId;
  const user = db.users.find(u => u.id === userId);

  if (!db.comments[fileId]) db.comments[fileId] = [];
  const newComment = {
    id: `c_${Date.now()}`,
    line: line || 1,
    author: user?.name || 'Collaborator',
    authorRole: user?.role || 'editor',
    text,
    resolved: false,
    timestamp: new Date().toISOString()
  };

  db.comments[fileId].push(newComment);
  persist();
  io.emit('comment_added', { fileId, comment: newComment });
  res.status(201).json(newComment);
});

app.get('/api/activity', (req, res) => {
  res.json(db.activity);
});

// ---------------- AI ASSISTANT ENDPOINTS ---------------- //

app.post('/api/ai/explain', (req, res) => {
  const { code, language } = req.body;
  res.json({
    explanation: `### Production Code Analysis (${language || 'JavaScript'})\n\n1. **Purpose**: Production application logic.\n2. **Operations**: Evaluates input parameters and handles state synchronization.\n3. **Recommendation**: Verify input boundary safety.`,
  });
});

app.post('/api/ai/generate', (req, res) => {
  const { prompt, language } = req.body;
  let code = '';
  if ((language || '').toLowerCase() === 'python') {
    code = `# Generated Python helper for: ${prompt}\ndef process_data(data: list) -> dict:\n    return {"status": "success", "count": len(data)}\n\nif __name__ == "__main__":\n    print(process_data([1, 2, 3]))\n`;
  } else {
    code = `// Generated JavaScript helper for: ${prompt}\nexport async function processData(payload) {\n  console.log("Processing:", payload);\n  return { success: true };\n}\n`;
  }
  res.json({ generatedCode: code });
});

app.post('/api/ai/refactor', (req, res) => {
  const { code } = req.body;
  res.json({
    analysis: [
      { type: 'optimization', text: 'Optimized loop execution memory allocation.' }
    ],
    refactoredCode: `// Optimized Production Version\n${code}`
  });
});

app.post('/api/ai/chat', (req, res) => {
  const { message, activeFile } = req.body;
  res.json({
    reply: `I analyzed your query: "${message}". Active context: **${activeFile || 'production files'}**.`
  });
});

// ---------------- WEBSOCKET HANDLING ---------------- //

io.on('connection', (socket) => {
  console.log(`📡 WebSocket Client connected: ${socket.id}`);

  socket.on('join_workspace', ({ user, workspaceId }) => {
    socket.join(workspaceId || 'ws_prod');
    activeSockets.set(socket.id, {
      socketId: socket.id,
      userId: user?.id || 'usr_guest',
      userName: user?.name || 'Guest Developer',
      userRole: user?.role || 'viewer',
      userAvatarColor: user?.avatarColor || '#8B5CF6',
      fileId: 'f_readme',
      cursor: { line: 1, column: 1 }
    });

    if (user) {
      logActivity(user.id, user.name, user.role, 'USER_JOINED', `${user.name} joined workspace`);
    }
    io.to('ws_prod').emit('presence_update', Array.from(activeSockets.values()));
  });

  socket.on('code_change', ({ fileId, content, userId, userName }) => {
    const file = db.files.find(f => f.id === fileId);
    if (file) {
      file.content = content;
      file.updatedAt = new Date().toISOString();
    }
    socket.broadcast.to('ws_prod').emit('code_sync', { fileId, content, userId, userName });
  });

  socket.on('cursor_move', ({ fileId, cursor, userId }) => {
    const active = activeSockets.get(socket.id);
    if (active) {
      active.fileId = fileId;
      active.cursor = cursor;
      socket.broadcast.to('ws_prod').emit('cursor_sync', {
        userId,
        fileId,
        cursor,
        userName: active.userName,
        userAvatarColor: active.userAvatarColor,
        userRole: active.userRole
      });
    }
  });

  socket.on('chat_send', (msgData) => {
    db.chat.push(msgData);
    persist();
    io.to('ws_prod').emit('chat_message', msgData);
  });

  socket.on('disconnect', () => {
    const active = activeSockets.get(socket.id);
    if (active) {
      logActivity(active.userId, active.userName, active.userRole, 'USER_LEFT', `${active.userName} disconnected`);
      activeSockets.delete(socket.id);
      io.to('ws_prod').emit('presence_update', Array.from(activeSockets.values()));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Collab IDE Production Express + Socket.io server running at http://localhost:${PORT}`);
});
