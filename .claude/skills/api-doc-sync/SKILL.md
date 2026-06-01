---
name: api-doc-sync
description: Sync docs/API.md with the actual backend API routes in love-map-mini.
---

You are syncing docs/API.md with the real API implementation.

Steps:
1. Read CLAUDE.md for the API response format and conventions.
2. Inspect apps/api route handlers and Zod schemas (src/modules/**, src/plugins/**).
3. For every route, record:
   - method and path
   - auth requirement (public / requireAuth)
   - request body / query params and their validation
   - success response shape
   - error codes
   - couple_id / user_id authorization notes
4. Update docs/API.md so it matches the code exactly. Do not invent endpoints.
5. Flag any route that is missing validation, authorization, or a consistent response format.
6. Do not change API behavior. Only documentation, unless explicitly asked to fix.
7. Summarize: routes added, routes updated, and mismatches found.
