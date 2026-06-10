# CLAUDE.md

## Project name

love-map-mini

## Product goal

Build a WeChat mini program for couples that combines:

1. A private couples memory map inspired by mappedlove.
2. A couples interaction system inspired by Leng-bingo/qinglv.

The final product must be an original implementation, not a direct copy of either repository.

## Reference projects

Reference only. Do not copy large chunks of code, UI assets, images, secrets, or branding.

- https://github.com/Yizack/mappedlove
  - Use as inspiration for: couples bond, memory map, place markers, stories, photo memories,
    public map sharing.
- https://github.com/Leng-bingo/qinglv
  - Use as inspiration for: WeChat mini program structure, couples binding, tasks, points,
    shop, calendar events, sign-in, and location check-in.

Keep license notices for referenced open-source projects in docs/THIRD_PARTY_NOTICES.md.
Do not reuse internet images from qinglv. Create placeholder UI assets or simple local icons.

## Architecture

Use a monorepo layout:

- apps/miniprogram: WeChat mini program.
- apps/api: Node.js backend.
- apps/web-share: optional public map sharing page.
- packages/shared: shared types, enums, and validation helpers.
- database: migrations and seed data.
- docs: product, API, database, privacy, deployment, and review docs.
- scripts: helper scripts.

Backend stack:

- Node.js
- TypeScript
- Fastify
- MySQL
- Prisma ORM unless an existing constraint makes another ORM simpler
- Zod for request validation
- JWT or signed session token for API auth
- Environment variables via .env.example
- No real secrets committed

Mini program stack:

- Native WeChat mini program files: wxml, wxss, js/ts, json
- Use the built-in map component
- Do not use Leaflet inside the mini program
- Keep pages simple and working before adding visual polish

## MVP phases

Phase 1:
- Project skeleton
- Backend health check
- Database config placeholder
- Mini program page skeleton
- Docs skeleton

Phase 2:
- Reference project analysis
- docs/REFERENCE_ANALYSIS.md
- Roadmap update

Phase 3:
- Prisma schema
- MySQL models
- Database docs

Phase 4:
- Mock login first
- WeChat login placeholder second
- User model
- Couple invite and binding flow

Phase 5:
- Places
- Memories
- Media metadata
- Map marker list API
- Mini program map page
- Add place and add memory pages

Phase 6:
- Check-ins
- Location permission copy
- Latest partner location
- Distance calculation
- No background tracking

Phase 7:
- Tasks
- Task status flow
- Points ledger
- Daily sign-in
- Points balance

Phase 8:
- Shop items
- Redeem item
- Inventory/backpack
- Mark redemption as used

Phase 9:
- Events
- Anniversaries
- Countdown/count-up
- Home dashboard

Phase 10:
- Privacy settings
- Public map share skeleton
- Third-party notices

Phase 11:
- Real WeChat login
- Object storage signed upload
- Deployment docs

Phase 12:
- Security review
- Privacy review
- API docs sync
- Final delivery checklist

## Privacy and safety requirements

This app handles relationship data, photos, and location. Implement privacy-first defaults.

Rules:
- Location sharing must be off by default.
- No background continuous tracking in MVP.
- Check-in is user-initiated only.
- Partner location is visible only after explicit consent.
- Allow users to delete check-ins, memories, and photo metadata.
- Public map sharing must be off by default.
- Public map should not expose precise home, school, or work coordinates by default.
- Every private API must verify user_id and couple_id access.
- Never store app secrets in source code.
- Never commit real OSS/COS keys, WeChat AppSecret, database password, or JWT secret.

## Coding rules

- Prefer small, reviewable changes.
- Before editing, summarize the plan and files likely to change.
- After every feature, update docs/API.md and docs/DATABASE.md if relevant.
- Add .env.example entries whenever new environment variables are needed.
- Add validation for every write API.
- Add error handling with a consistent response format.
- Avoid unnecessary dependencies.
- Ask before adding heavy production dependencies.
- Use TypeScript for backend.
- Use clear names and simple code over clever abstractions.
- Do not leave TODOs for core MVP behavior unless explicitly requested.

## API response format

Success:
{
  "success": true,
  "data": {}
}

Error:
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}

## Done criteria

For each task:
- Code compiles or the limitation is clearly documented.
- Relevant pages/routes are wired.
- API endpoints include validation and authorization.
- Database migration is updated if schema changed.
- docs/API.md is updated if API changed.
- docs/DATABASE.md is updated if schema changed.
- docs/PRIVACY.md is updated if location, photo, consent, or sharing changed.
- No real secrets are committed.
- docs/THIRD_PARTY_NOTICES.md is updated if reference code or dependency license matters.
- The final response lists changed files, validation commands, known limitations, and next steps.

## Preferred Claude workflow

When receiving a phase prompt:
1. Read CLAUDE.md.
2. Inspect the current file tree.
3. Restate the objective and acceptance criteria.
4. Create a small implementation plan.
5. Edit files.
6. Run the most relevant checks.
7. Update docs.
8. Summarize changed files, validation results, and open issues.

## Stop conditions

Stop and ask for human confirmation before:
- deleting large directories
- changing license terms
- adding paid services
- adding background location tracking
- committing or printing real secrets
- changing product scope from private couple app to public social app

# Claude Code workflow

## Codex plugin
- Use `/codex:review --background` after meaningful code changes.
- Use `/codex:adversarial-review --background` before PRs, migrations, auth/security changes, database changes, dependency upgrades, or risky refactors.
- Use `/codex:status` to check background Codex jobs.
- Use `/codex:result` to retrieve finished Codex results.
- Use `/codex:rescue` only when stuck or when a second independent agent should attempt a solution.

## ccusage
- For usage or cost checks, run:
  - `ccu-all`
  - `ccu-claude`
  - `ccu-codex`
  - `ccu-blocks`
- Prefer compact summaries unless I ask for detailed tables.

## Safety
- Never print, store, or commit credentials.
- Never commit `.env`, auth files, token files, local MCP configs with secrets, or private logs.
- Before destructive operations, explain the action and ask for confirmation.
- Keep changes small and reviewable.

# Claude Code statusline

This project uses `ccstatusline` for Claude Code status-line display.

Preferred visible fields:
- model
- current directory or git root
- git branch
- git clean/dirty status
- context percentage
- session cost
- block timer
- weekly/session usage
- token usage
- compaction counter when available

Rules:
- Keep the statusline readable and compact.
- Prefer pinned `ccstatusline` command over auto-running `ccstatusline@latest`.
- If Powerline symbols render incorrectly, switch to a minimal ASCII theme.
- Do not remove Codex plugin or ccusage when editing Claude Code settings.

Useful commands:
- `ccstatusline`
- `npx -y ccstatusline@latest`
- `bunx -y ccstatusline@latest`
- `ccu-all`
- `ccu-claude`
- `ccu-codex`
