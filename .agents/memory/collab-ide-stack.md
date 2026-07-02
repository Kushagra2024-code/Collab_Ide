---
name: CollabIDE stack decisions
description: Core tech choices, package layout, and non-obvious conventions for the CollabIDE monorepo.
---

## Stack
- **API**: Express 5, Drizzle ORM, PostgreSQL (`@workspace/db`), Socket.io on `/ws/socket.io`
- **Auth**: Manual JWT via `jsonwebtoken`, secret read from `SESSION_SECRET` env var — **no fallback**, fails fast at startup if absent.
- **Frontend**: React + Vite, Tailwind, Monaco Editor, react-resizable-panels, Wouter router, TanStack Query, Socket.io-client.
- **Codegen**: OpenAPI spec at `lib/api-spec/openapi.yaml`; Orval generates React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`). Run `pnpm codegen` to regenerate.

## Socket patterns
- `useSocket` exposes `socket` as **React state** (not a ref snapshot). Consumers must guard `if (!socket) return` and list `socket` as a dependency — this is what triggers handler registration after the connection is established.
- Server emits `{ userId, name, avatarUrl }` for user events; clients normalize with `name → userName` before storing in component state. Never access `u.userName` directly on a raw server payload.
- `presence_list` is emitted by the server immediately after `join_project` succeeds — always register a handler to initialize the online-users list.

## Non-obvious conventions
- Deep-path imports like `@workspace/api-client-react/src/generated/api` **do not work** from the frontend — always import from the package root `@workspace/api-client-react`. The `exports` field only exposes `"."`.
- The API server uses esbuild for bundling; avoid importing from `zod/v4` directly in server code — it can't resolve. Duck-type ZodError instead.
- `projects.ownerId` is `integer`, not `serial` — the schema fix was needed after initial codegen.
- Socket.io path is `/ws/socket.io` (non-default); artifact.toml must include `/ws` in `paths` for proxying.

**Why:** Decisions made to fit the existing monorepo scaffold; deviating from these will break the build or the proxy.
