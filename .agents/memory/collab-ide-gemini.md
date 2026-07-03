---
name: CollabIDE Gemini AI Integration
description: How the Gemini AI coding assistant is wired into the CollabIDE — env vars, bundler fix, and template patches needed.
---

# CollabIDE — Gemini AI Integration

## Setup
- Uses user-supplied `GEMINI_API_KEY` secret (Replit AI Integration upgrade was declined).
- Template files copied from `.local/skills/ai-integrations-gemini/templates/lib/` to `lib/`.

## Required Patches to Template Files
Both `lib/integrations-gemini-ai/src/client.ts` and `lib/integrations-gemini-ai/src/image/client.ts` originally threw if `AI_INTEGRATIONS_GEMINI_BASE_URL` was not set (Replit proxy guard). Both were patched to fall back to `GEMINI_API_KEY` and only apply `baseUrl` when `AI_INTEGRATIONS_GEMINI_BASE_URL` is also present.

## Bundler Fix
`artifacts/api-server/build.mjs` had `"@google/*"` in the esbuild `external` array. This prevents `@google/genai` from being bundled, causing a runtime `ERR_MODULE_NOT_FOUND`. The `"@google/*"` line must be **removed** (leave `"@google-cloud/*"` in place).

**Why:** The api-server bundles into a single ESM file via esbuild. Externalized packages must be resolvable at runtime in `node_modules`. `@google/genai` lives in `lib/integrations-gemini-ai/node_modules` and is not hoisted to the top-level, so Node.js cannot find it unless it's bundled.

## Workflow Commands
Services need PORT set inline in the workflow command (shared env var conflicts between api and frontend):
- API Server: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Collab IDE Frontend: `PORT=3000 BASE_PATH=/collab-ide pnpm --filter @workspace/collab-ide run dev`

## Architecture
- Backend route: `artifacts/api-server/src/routes/gemini.ts` — conversations + SSE streaming
- Frontend component: `artifacts/collab-ide/src/components/ai-panel.tsx`
- AI panel is in the right sidebar as a tab alongside Activity
- Project context is injected via `[projectId:N]` prefix in messages; server extracts and builds file tree context
- Generated React Query hook for `useCreateGeminiConversation` expects `{ data: GeminiConversationInput }` (not flat object)
- `useGetGeminiConversation` with `enabled` requires passing `queryKey` explicitly alongside `enabled`
