# Collab IDE — Collaborative Cloud Development Environment

A modern, high-performance real-time collaborative IDE built with React 18, Vite, Tailwind CSS, Monaco Editor, Express, and Socket.io.

## Features

- **Real-Time Collaboration**: Multi-user live editing, cursor tracking, and presence indicators powered by Socket.io.
- **Multi-Language Code Execution**: Built-in interactive terminal & runner executing Python (`python3`), JavaScript (`node`), Bash, TypeScript, and more.
- **Nested File & Folder Management**: Create, rename, delete files and deeply nested directories with instant tree updates.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Owners, Admins, Editors, and Viewers.
- **Version Control & Diffs**: In-editor visual diff viewer, point-in-time file snapshot history, and restore points.
- **Integrated Team Tools**: Team chat, inline code comments & code review threads, activity audit logs, and member invitation modal.
- **AI Assistant**: Built-in coding assistant panel for explanations, refactoring, and test generation.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Servers
Runs both the Express/Socket.io backend (port 5000) and the Vite frontend (port 3000) concurrently:
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```

---

## Tech Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS, Monaco Editor, Lucide Icons
- **Backend**: Node.js, Express, Socket.io, JSON storage with atomic writes
- **Authentication**: JWT & secure password hashing
