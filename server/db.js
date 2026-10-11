import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'collab_ide.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
  users: [],
  workspace: {
    id: 'ws_prod',
    name: 'Production Engineering Workspace',
    description: 'AI-Powered Collaborative Platform',
    inviteCode: 'COLLAB-PROD-2026',
    createdAt: new Date().toISOString(),
    members: []
  },
  files: [
    {
      id: 'f_readme',
      name: 'README.md',
      path: '/README.md',
      type: 'file',
      parentId: null,
      language: 'markdown',
      content: `# ⚡ Collab IDE — Production Workspace\n\nWelcome to your collaborative workspace!\n\n## Getting Started\n- Create files and folders using the Explorer sidebar.\n- Run Python and JavaScript code live in the Execution Terminal.\n- Invite collaborators using your Workspace Invite Link.`,
      updatedAt: new Date().toISOString()
    }
  ],
  versions: {
    'f_readme': [
      {
        id: 'v_init',
        versionNumber: 1,
        timestamp: new Date().toISOString(),
        authorName: 'System',
        commitMessage: 'Initial Production Workspace creation',
        content: `# ⚡ Collab IDE — Production Workspace\n\nWelcome to your collaborative workspace!`
      }
    ]
  },
  chat: [],
  activity: [
    {
      id: `act_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'system',
      userName: 'System Engine',
      userRole: 'owner',
      action: 'SYSTEM_BOOT',
      details: 'Initialized Production Workspace Environment'
    }
  ],
  comments: {}
};

export function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      saveDb(DEFAULT_DB);
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading DB file, falling back to default:', err);
    return DEFAULT_DB;
  }
}

export function saveDb(dbData) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving DB file:', err);
  }
}
