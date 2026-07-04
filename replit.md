# CollabIDE

A real-time collaborative development workspace. Multiple developers can open the same project, edit code simultaneously with live cursor sharing (Yjs CRDT), chat, use the shared terminal, and get AI-powered coding assistance via Gemini.

## Run & Operate

- `pnpm install` — install all workspace dependencies (required on first run)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/collab-ide run dev` — Frontend (port 3000, BASE_PATH=/collab-ide)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run typecheck` — full typecheck across all packages

### Required env / secrets

| Key | How to set |
|-----|------------|
| `DATABASE_URL` | Auto-injected by Replit (runtime-managed) |
| `SESSION_SECRET` | Replit Secret — used for JWT signing |
| `GEMINI_API_KEY` | Replit Secret — powers the AI assistant |

## Stack

- **Monorepo**: pnpm workspaces, Node.js 20/24, TypeScript 5.9
- **Backend**: Express 5, Socket.io (path `/ws/socket.io`), Pino logger
- **DB**: PostgreSQL + Drizzle ORM (schema in `lib/db`)
- **Auth**: JWT via `SESSION_SECRET`, bcrypt password hashing
- **AI**: Google Gemini via `lib/integrations-gemini-ai` (lazy client — server starts without the key)
- **Frontend**: React 19, Vite 7, Monaco Editor, xterm.js, Yjs CRDT
- **API codegen**: Orval → `lib/api-client-react` (React Query hooks) + `lib/api-zod` (Zod schemas)

## Where things live

- `lib/db/src/schema.ts` — Drizzle schema (single source of truth for DB)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (gates codegen)
- `artifacts/api-server/src/` — Express routes, socket events, auth, AI
- `artifacts/collab-ide/src/` — React app; `pages/`, `components/`, `hooks/`
- `artifacts/collab-ide/src/components/terminal-panel.tsx` — xterm.js multi-tab terminal
- `artifacts/collab-ide/src/components/ai-panel.tsx` — Gemini streaming AI assistant

## Architecture decisions

- **Gemini client is lazy**: `lib/integrations-gemini-ai/src/client.ts` uses a Proxy so the API key is only required when AI endpoints are actually called, not at server startup.
- **node-pty build skipped**: `node-pty` native compilation is skipped (no Python in Replit env); `socket.ts` falls back to `child_process.spawn` for the shared terminal.
- **JWT over sessions**: Auth tokens are signed with `SESSION_SECRET` and stored in localStorage; no cookie/session store needed.
- **Yjs relay is best-effort**: The y-websocket server fails to start (package export issue) but the socket.ts CRDT relay (`yjs_update` events) works independently.
- **Project Runner**: Run button auto-detects project language/entry point and sends the appropriate shell command to a new terminal tab.

## Implemented features

1. ✅ Auth (register / login / JWT)
2. ✅ Project CRUD + RBAC (owner/admin/editor/viewer)
3. ✅ Collaborative File Explorer — tree, create, rename, delete, download
4. ✅ Real-Time Collaboration — Yjs CRDT relay, live cursors, presence
5. ✅ Shared Terminal — xterm.js multi-tab, node-pty → spawn fallback
6. ✅ Project Runner — Run button detects language and executes in terminal
7. ✅ Team Chat — Socket.io + REST persistence
8. ✅ AI Coding Agent — Gemini streaming SSE, conversation history
9. ✅ AI Code Modification Workflow — suggestion log in activity feed
10. ✅ Activity Dashboard
11. ✅ Notifications — real-time push via `emitToUser`

## Gotchas

- After `pnpm install`, esbuild and node-pty show as "Ignored build scripts" but esbuild binaries are already in the pnpm store — builds work fine.
- Run `pnpm --filter @workspace/db run push` after any schema change (drizzle-kit push in dev).
- The `y-websocket` server fails to start due to a package export issue (`./bin/utils` not exported). The Yjs CRDT relay in socket.ts still works via direct update broadcasting.
- Do NOT add `node-pty` back to `pnpm.onlyBuiltDependencies` in `package.json` — Python is not available in the Replit container, so the native build will fail.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
