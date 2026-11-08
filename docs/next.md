# Next

Last updated 2026-11-08 by Claude.

## Where the work stands

- Process model: template v1 and the four segment functions are drafted; the 2026-10-26 review changes and the app docs are on `main` and pushed.
- Phase 2, the hand run on a past project, is postponed until after ConCon; the app is built and demoed on invented data. See `docs/decisions.md`.
- Product direction: build toward a working product. ConCon is on 2026-11-18; the talk is mostly about how AI and people should collaborate, and the app is shown as an example at whatever stage it has reached. Stack and model are in `docs/architecture.md`, the plan in `docs/plan.md`, the design snapshot in `docs/design/`.
- The build runs in Claude Code locally in this repo; `docs/plan.md` is the source of truth for the plan. The Workbench board artifact was retired on 2026-11-08 and now points here. See `docs/decisions.md`.
- Stack accepted: pnpm, Hono and SSE. `docs/tutorial-pnpm-hono-sse.md` stays as Mikael's reference.
- The TypeScript workspace is scaffolded, on `main` and pushed: `apps/api` (Hono, `/api/health`), `apps/web` (React and Vite, a placeholder page) and `packages/shared` (zod, the card statuses). `pnpm check` passes: lint, typecheck, 4 tests and the validator. `pnpm build` works. The API and web dev servers have not yet been run together.
- On `main` and pushed: a `Stop` hook that runs `pnpm check` before a turn ends; zod schemas for teammate, process profile, card, status with `waiting_on`, question and event in `packages/shared/src/domain.ts`; and a schema and loader for function file front matter that all four function files pass. `pnpm check` passes with 43 tests.

## Waiting for Mikael

1. **Which past project for the Phase 2 run?** Not needed before ConCon on 2026-11-18. Recommendation: choose it in the week after ConCon and run Phase 2 before adding any template field for failed checks or waiting on another role, because that run is what shows whether those fields are needed.
2. **Should `process/template.md` list the protocols' `note` field?** Every function file uses it, but the template names only `opens`, `asks`, `writes` and `decides`. Recommendation: add it to the template as optional prose without a version bump, because it describes a field already in use and the schema already accepts it.

## Next, in the suggested order

1. Mikael: replace the plan text in the claude.ai project with "The plan lives in `docs/plan.md` in the workbench repo; this project is for design and discussion."
2. Build the event store in SQLite through Drizzle, with card, board and cycle logs as queries. Seed it with invented example data, marked as invented and kept in one module so a real project can replace it later.
3. Build the API: board, pick, ask, answer, move status, and an SSE stream of events.
4. Build the board UI from the Main artboard: columns, cards with mode pills, cycle log, live updates.
5. Add a read-only `design-reviewer` subagent (Read, Grep, Glob) that compares a built screen with its artboard and the tokens in `docs/design/`. Add one line to `AGENTS.md` saying when to use it.
6. Add one AI teammate behind a provider interface: it picks a card, works it in `assist` mode and raises a question that moves the card to Needs input.
7. Build card detail and the answer flow from the Card artboard.
8. Build the teammate profile from the Profile artboard, with modes read from the function files.
9. Port the structural checks from `checks/validate_functions.py` to `packages/shared`; keep the Python version until both give the same results.
