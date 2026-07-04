Overview

This workspace is a prototype collaborative IDE consisting of:

- `artifacts/api-server/` — Express + Socket.IO backend, Drizzle ORM, optional Yjs websocket
- `artifacts/collab-ide/` — frontend React + Monaco editor UI

Optional (recommended) dependencies

- Yjs persistence + server: `yjs`, `y-websocket`, `ws`, `y-leveldb`
  - Enables production-quality CRDT syncing and persistent document storage.
- Monaco binding: `y-monaco`, `y-protocols`
  - Provides efficient editor bindings and awareness (remote cursors).
- PTY support (server-side): `node-pty`
  - Provides proper terminal behavior (resize, binary IO).
- Docker (host): required to use the Docker sandbox for terminal isolation.

Quick setup (root)

1. Install repository dependencies (using pnpm in this workspace):

```bash
pnpm install
pnpm --filter "artifacts/api-server" install
pnpm --filter "artifacts/collab-ide" install
```

2. Optional: add packages for CRDT and PTY on the server and client

```bash
# server-side (api-server)
cd artifacts/api-server
pnpm add yjs y-websocket ws y-leveldb node-pty

# client-side (collab-ide)
cd ../collab-ide
pnpm add yjs y-websocket y-monaco y-protocols
```

3. Environment variables

- `PORT` — API server port (required)
- `YJS_PORT` — optional port for embedded y-websocket server (defaults to PORT+1)
- `YJS_STORAGE_PATH` — directory used by `y-leveldb` for persistence
- `SANDBOX_DOCKER` — set to `true` to enable Docker-based terminal sandboxes
- `SANDBOX_IMAGE` — Docker image used for sandboxes (default `ubuntu:22.04`)

Run steps

```bash
# start backend
cd artifacts/api-server
PORT=4000 pnpm dev

# start frontend (in separate terminal)
cd artifacts/collab-ide
pnpm dev
```

Notes and next steps

- The server attempts to start an embedded `y-websocket` server if `y-websocket` and `ws` are installed. If `y-leveldb` is available, it will enable LevelDB persistence at `YJS_STORAGE_PATH`.
- Terminal sandboxing requires Docker on the host; the server will use Docker CLI to create per-project containers. If Docker is unavailable the server falls back to spawning local shells.
- Frontend attempts to dynamically import `y-monaco` and `y-websocket` for CRDT bindings — if those packages aren't installed the editor will still work as a single-user editor and will use a coarse sync fallback when possible.
- For production readiness: secure the Yjs endpoint, add persistence storage backups, and harden the Docker sandbox (seccomp, user namespaces).

If you want, I can:
- Add dependencies to `package.json` and install them automatically, or
- Implement CI tests and basic e2e smoke tests for sockets and terminals.
