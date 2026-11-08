# Architecture: the workbench app

As of 2026-11-08. The direction, TypeScript, pnpm, Hono and SSE were decided with Mikael. `docs/tutorial-pnpm-hono-sse.md` introduces the last three. Reasons are in `docs/decisions.md`.

## Goal

Build toward a working product. Demo it at ConCon on 2026-11-18 at whatever stage it has reached. The talk is mostly about how AI and people should collaborate; the app is an example of the idea, not a finished product. The first UI follows the Claude Design concept "AI teammate on the team board" (snapshot and tokens in `docs/design/`): the board, one card from pick to done, card detail and teammate profile.

## Stack

| Part | Choice |
| --- | --- |
| Language | TypeScript everywhere |
| Repo | One repo, pnpm workspaces |
| Frontend | React + Vite, in `apps/web` |
| Backend | Node + Hono, in `apps/api` |
| Shared | zod schemas and types, in `packages/shared` |
| Storage | SQLite through Drizzle now, Postgres later |
| Live updates | Server-sent events from the API |
| AI | Claude Agent SDK or Anthropic SDK behind a provider interface, so the model can change |

The process model in `process/` stays the source of truth. The app reads the function files' YAML front matter; it never hardcodes their fields.

## Layout

```
apps/
  web/          # board, card detail, teammate profile
  api/          # HTTP API, event store, SSE stream, AI teammate runner
packages/
  shared/       # zod schemas for cards, events, teammates, function files
process/        # the process model (unchanged)
checks/         # Python validator, until ported to packages/shared
```

## Domain model

- **Teammate**: `kind` is `human` or `ai`. A human has a process profile.
- **Process profile**: a mode (`manual`, `assist`, `delegate`) for each function the person owns. The AI works on a step in the mode of the step's owner.
- **Card**: id, title, function (from `process/functions/`), owner, status, milestone, links to other cards.
- **Status**: `backlog`, `ready`, `in_progress`, `needs_input`, `review`, `done`. `needs_input` carries `waiting_on` (a teammate, human or AI) and the open question.
- **Question**: asked by, asked of, card, text, why it blocks, answer, decided by. Answers go into the card's decision log; tacit knowledge goes into `writes_back` proposals.
- **Event**: picked, asked, answered, check_ran, status_changed, report_posted. Append-only.

## Logs are views of one event stream

The card log, the board log and the cycle log are three queries over the same events. Store events, not three logs. The lines between teammates on the board come from open questions plus who is working on which card. The learning layer (phase 5) reads the same events.

## Cards and external trackers

The app has its own board for now. Card storage sits behind an interface so GitHub Issues can become the source of cards later without changing the UI.

## Checks

Structural checks run in the API on every draft, so they move from `checks/validate_functions.py` into `packages/shared`. Keep the Python validator in CI until the TypeScript version gives the same results on every function file.

## First slice

The core loop, end to end:

1. The board shows columns, cards with mode pills and a live cycle log.
2. One AI teammate picks a card and works it in `assist` mode.
3. It needs input, so it asks a person on the card; the card moves to Needs input.
4. Mikael answers on the card; the card goes back to In progress; every step shows in the logs.

Seed data is invented, marked as invented and kept in one module, so the Phase 2 project can replace it after ConCon (see `docs/decisions.md`, 2026-11-08).
