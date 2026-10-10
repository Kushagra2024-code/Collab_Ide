# CollabIDE — Comprehensive Project Specification & Feature Guide

CollabIDE is a high-performance, real-time collaborative cloud IDE built with React 19, Express 5, Socket.IO, Monaco Editor, Yjs CRDTs, and Google Gemini AI.

---

## 1. System Architecture

- **Monorepo Structure**: `pnpm` workspace containing `@workspace/api-server`, `@workspace/collab-ide`, `@workspace/db`, `@workspace/api-zod`, `@workspace/api-spec`, and `@workspace/integrations-gemini-ai`.
- **Single-Port Deployment**: Deployed on Render as a unified service where Express serves the built React static assets, REST API endpoints, Socket.IO, and Yjs WebSocket connections over a single HTTP `$PORT`.

---

## 2. Core Feature Modules

### A. Authentication & User Management
- **Registration**: User signup with name, email, password, and optional avatar URL.
- **Login**: Email/Password authentication returning a 7-day signed JWT.
- **JWT Storage & Verification**: Token passed via `Authorization: Bearer <token>` or `socket.handshake.auth.token`.
- **Test / Fallback Auth**: Fallback session secrets and robust error handling so auth never crashes with 500 errors.

### B. Project Management & Role-Based Access Control (RBAC)
- **Project CRUD**: Create, read, update, delete collaborative projects.
- **Privacy Controls**: Public vs Private projects.
- **Member Roles**: Owner, Admin, Editor, Viewer.
- **Invite Links**: Generates shareable tokenized invite links (`/api/projects/:id/invite-link`).

### C. Real-Time Collaborative Code Editor
- **Monaco Editor Integration**: Syntax highlighting, code completion, minimap, formatting.
- **Yjs CRDT Synchronization**: Multi-user concurrent text editing without conflict resolution bugs.
- **Live Cursor & Selection Tracking**: Shows color-coded user cursors and active line selections in real-time.
- **Presence List**: Live indicator of online collaborators per project room.

### D. Shared Multi-Tab Terminal & Code Execution
- **xterm.js Terminal**: Embedded terminal emulator supporting full ANSI colors and cursor positioning.
- **Pty / Spawn Engine**: Process execution using `node-pty-prebuilt-multiarch` with automatic `child_process.spawn` fallback.
- **Project Runner**: One-click "Run" button auto-detects programming languages (Python, JS/TS, C/C++, Go, Rust, Java) and executes scripts in a dedicated terminal tab.

### E. AI-Powered Coding Assistant (Google Gemini)
- **Chat Assistant**: Natural language conversation interface powered by `@google/genai` (Gemini 2.5 / 3.8 Flash).
- **Streaming Responses**: Server-Sent Events (SSE) for fast token streaming.
- **Code Modification Workflow**: AI generates diffs and suggestions that can be reviewed and accepted into active files.

### F. File System & Explorer
- **Folder Tree Hierarchy**: Nested directories and file management.
- **File CRUD**: Create, rename, delete files and folders.
- **File History & Favorites**: Track recent file views and starred files.

### G. Team Chat & Notifications
- **Project Chat Channels**: Dedicated real-time chat rooms per project.
- **Reactions & Formatting**: Emoji reactions and markdown code snippets.
- **Real-Time Push Notifications**: Targeted socket notifications emitted to specific user sockets (`emitToUser`).

---

## 3. Database Schema Overview

```sql
users (id, name, email, password_hash, avatar_url, bio, created_at, updated_at)
projects (id, name, description, is_public, owner_id, created_at, updated_at)
project_members (id, project_id, user_id, role, created_at)
project_files (id, project_id, name, path, content, is_folder, parent_id, created_at, updated_at)
chat_messages (id, project_id, user_id, channel_id, content, created_at)
activity_logs (id, project_id, user_id, action, details, created_at)
```

---

## 4. Production Security & Reliability Policies

1. **RCE Prevention**: Process execution uses isolated argument arrays with stdin piping; shell string concatenation is strictly prohibited.
2. **Path Traversal Protection**: All file path access is validated via `safeJoin` to ensure operations stay strictly within the target project directory.
3. **Rate Limiting**: Express sliding-window rate limiters protect auth (30 req/min) and general API endpoints (300 req/min).
4. **CORS & Security Headers**: Strict CORS origin verification and standard security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`).
