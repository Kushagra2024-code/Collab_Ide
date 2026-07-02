---
name: CollabIDE security patterns
description: Access control patterns used in the API server and Socket.io layer.
---

## HTTP: requireProjectMember middleware
Located at `artifacts/api-server/src/middlewares/requireProjectMember.ts`.

Apply after `requireAuth` on every project-scoped route:
```ts
router.get("/projects/:projectId/foo", requireAuth, requireProjectMember(/* isPublicAllowed= */ true), handler)
router.patch("/projects/:projectId/foo", requireAuth, requireProjectMember(), handler)
```
- `requireProjectMember(true)` — allows unauthenticated members to read if `project.isPublic`.
- Attaches `(req as any).projectRole` (owner/admin/editor/viewer) for downstream role checks.
- Viewers are blocked from write operations inside the handler.

## Socket.io: room-gating pattern
`join_project` event verifies DB membership before `socket.join(room)`.
All subsequent events (`code_change`, `cursor_move`, `chat_message`, `typing_*`) call `isInRoom(projectId)` and silently drop events from sockets that are not in the claimed room. This prevents cross-project injection by any authenticated user.

**Why:** The review found that any logged-in user could hit project-scoped routes and socket events without membership checks — this was the highest-impact finding.

**How to apply:** Every new project-scoped HTTP route gets `requireProjectMember()`; every new socket event that references a projectId gets an `isInRoom()` guard before broadcasting.
