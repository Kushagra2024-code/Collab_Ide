const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function getToken(): string | null {
  return localStorage.getItem('collab_token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface AiSuggestion {
  id: number;
  projectId: number;
  userId: number;
  title: string;
  description: string | null;
  diff: string;
  filePath: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  createdAt: string;
  userName?: string | null;
}

export interface ProjectRun {
  id: number;
  projectId: number;
  userId: number;
  command: string;
  status: string;
  port: number | null;
  output: string | null;
  errorOutput: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface Problem {
  id: number;
  projectId: number;
  title: string;
  statement: string;
  constraints: string | null;
  examples: { input: string; expectedOutput: string; explanation?: string }[];
  notes: string | null;
  codeTemplates: Record<string, string>;
  supportedLanguages: string[];
}

export interface ProblemSubmission {
  id: number;
  problemId: number;
  language: string;
  code: string;
  verdict: string;
  executionTimeMs: number | null;
  memoryKb: number | null;
  output: string | null;
  createdAt: string;
  userName?: string | null;
}

export interface ProjectDoc {
  id: number;
  projectId: number;
  docType: string;
  content: string;
  generatedBy: string | null;
  updatedAt: string;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface RolePermissions {
  role: string;
  permissions: string[];
}

export const extensionsApi = {
  getPermissions: (projectId: number) =>
    apiFetch<RolePermissions>(`/projects/${projectId}/permissions`),

  searchFiles: (projectId: number, q: string) =>
    apiFetch<any[]>(`/projects/${projectId}/files-search?q=${encodeURIComponent(q)}`),

  getFavorites: (projectId: number) =>
    apiFetch<any[]>(`/projects/${projectId}/files-favorites`),

  getRecent: (projectId: number) =>
    apiFetch<any[]>(`/projects/${projectId}/files-recent`),

  toggleFavorite: (projectId: number, fileId: number) =>
    apiFetch<{ favorited: boolean }>(`/projects/${projectId}/files/${fileId}/favorite`, { method: 'POST' }),

  recordFileView: (projectId: number, fileId: number) =>
    apiFetch<void>(`/projects/${projectId}/files/${fileId}/view`, { method: 'POST' }),

  moveFile: (projectId: number, fileId: number, parentId: number | null) =>
    apiFetch<any>(`/projects/${projectId}/files/${fileId}/move`, {
      method: 'POST',
      body: JSON.stringify({ parentId }),
    }),

  copyFile: (projectId: number, fileId: number, parentId?: number | null) =>
    apiFetch<any>(`/projects/${projectId}/files/${fileId}/copy`, {
      method: 'POST',
      body: JSON.stringify({ parentId }),
    }),

  uploadFile: (projectId: number, name: string, content: string, parentId?: number | null) =>
    apiFetch<any>(`/projects/${projectId}/files-upload`, {
      method: 'POST',
      body: JSON.stringify({ name, content, parentId }),
    }),

  downloadFile: async (projectId: number, fileId: number, filename: string) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/files/${fileId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // AI suggestions
  getAiSuggestions: (projectId: number) =>
    apiFetch<AiSuggestion[]>(`/projects/${projectId}/ai/suggestions`),

  createAiSuggestion: (projectId: number, data: { title: string; description?: string; diff: string; filePath?: string }) =>
    apiFetch<AiSuggestion>(`/projects/${projectId}/ai/suggestions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveSuggestion: (projectId: number, suggestionId: number) =>
    apiFetch<AiSuggestion>(`/projects/${projectId}/ai/suggestions/${suggestionId}/approve`, { method: 'POST' }),

  rejectSuggestion: (projectId: number, suggestionId: number) =>
    apiFetch<AiSuggestion>(`/projects/${projectId}/ai/suggestions/${suggestionId}/reject`, { method: 'POST' }),

  // Git
  gitStatus: (projectId: number) => apiFetch<GitResult>(`/projects/${projectId}/git/status`),
  gitLog: (projectId: number) => apiFetch<GitResult>(`/projects/${projectId}/git/log`),
  gitDiff: (projectId: number, staged?: boolean) =>
    apiFetch<GitResult>(`/projects/${projectId}/git/diff${staged ? '?staged=true' : ''}`),
  gitBranches: (projectId: number) => apiFetch<{ branches: string[]; current: string }>(`/projects/${projectId}/git/branches`),
  gitCommit: (projectId: number, message: string) =>
    apiFetch<GitResult>(`/projects/${projectId}/git/commit`, { method: 'POST', body: JSON.stringify({ message }) }),
  gitCreateBranch: (projectId: number, name: string) =>
    apiFetch<GitResult>(`/projects/${projectId}/git/branch`, { method: 'POST', body: JSON.stringify({ name }) }),

  // Runner
  listRuns: (projectId: number) => apiFetch<ProjectRun[]>(`/projects/${projectId}/runs`),
  startRun: (projectId: number, command?: string) =>
    apiFetch<ProjectRun>(`/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  stopRun: (projectId: number, runId: number) =>
    apiFetch(`/projects/${projectId}/runs/${runId}/stop`, { method: 'POST' }),

  // Problems
  listProblems: (projectId: number) => apiFetch<Problem[]>(`/projects/${projectId}/problems`),
  getProblem: (projectId: number, problemId: number) =>
    apiFetch<Problem>(`/projects/${projectId}/problems/${problemId}`),
  submitProblem: (projectId: number, problemId: number, data: { language: string; code: string; customInput?: string }) =>
    apiFetch<ProblemSubmission>(`/projects/${projectId}/problems/${problemId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listSubmissions: (projectId: number, problemId: number) =>
    apiFetch<ProblemSubmission[]>(`/projects/${projectId}/problems/${problemId}/submissions`),

  // Documentation
  listDocs: (projectId: number) => apiFetch<ProjectDoc[]>(`/projects/${projectId}/docs`),
  generateDoc: (projectId: number, docType: string) =>
    apiFetch<ProjectDoc>(`/projects/${projectId}/docs/${docType}/generate`, { method: 'POST' }),

  // Invite links
  createInviteLink: (projectId: number, role?: string, expiresInDays?: number) =>
    apiFetch<{ token: string; url: string }>(`/projects/${projectId}/invite-links`, {
      method: 'POST',
      body: JSON.stringify({ role, expiresInDays }),
    }),

  acceptInvite: (token: string) =>
    apiFetch<{ projectId: number; role: string }>(`/invite/${token}/accept`, { method: 'POST' }),

  // Chat channels & reactions
  listChannels: (projectId: number) => apiFetch<any[]>(`/projects/${projectId}/channels`),
  addReaction: (projectId: number, messageId: number, emoji: string) =>
    apiFetch(`/projects/${projectId}/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
};
