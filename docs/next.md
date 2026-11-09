# Next

Last updated 2026-11-09 by Claude.

## Where the work stands

- Process model: template v1 and the four segment functions are drafted; the 2026-10-26 review changes and the app docs are on `main` and pushed.
- Phase 2, the hand run on a past project, is postponed until after ConCon; the app is built and demoed on invented data. See `docs/decisions.md`.
- Product direction: build toward a working product. ConCon is on 2026-11-18; the talk is mostly about how AI and people should collaborate, and the app is shown as an example at whatever stage it has reached. Stack and model are in `docs/architecture.md`, the plan in `docs/plan.md`, the design snapshot in `docs/design/`.
- The build runs in Claude Code locally in this repo; `docs/plan.md` is the source of truth for the plan. The Workbench board artifact was retired on 2026-11-08 and now points here. On 2026-11-09 Mikael replaced the plan file in the claude.ai project with a pointer to `docs/plan.md` in its instructions. See `docs/decisions.md`.
- Stack accepted: pnpm, Hono and SSE. `docs/tutorial-pnpm-hono-sse.md` stays as Mikael's reference.
- The TypeScript workspace is scaffolded, on `main` and pushed: `apps/api` (Hono, `/api/health`), `apps/web` (React and Vite, a placeholder page) and `packages/shared` (zod, the card statuses). `pnpm check` passes: lint, typecheck, 4 tests and the validator. `pnpm build` works. The API and web dev servers have not yet been run together.
- On `main` and pushed: a `Stop` hook that runs `pnpm check` before a turn ends; zod schemas for teammate, process profile, card, status with `waiting_on`, question and event in `packages/shared/src/domain.ts`; and a schema and loader for function file front matter that all four function files pass. `pnpm check` passes with 43 tests.
- Merged to `main` on 2026-11-08, not pushed: the event store in `apps/api` (libSQL through Drizzle 0.45; status derived from events; card, board and cycle logs as queries; invented seed in `apps/api/src/seed/invented.ts`) and the read-only `design-reviewer` subagent in `.claude/agents/`. ESLint ignores `.claude/worktrees/`.
- Also merged, not pushed: the board API in `apps/api/src/app.ts` (board, card, create, pick, ask, answer, status, and SSE at `/api/events` resuming by `Last-Event-ID`; request types in `packages/shared/src/api.ts`); the AI teammate in `apps/api/src/teammates/` with a stub provider and no model calls (`pnpm --filter @workbench/api teammate:run`), not yet wired into HTTP; and the TypeScript validator in `pnpm check` (`pnpm validate`), with the Python deleted. `pnpm check` passes with 114 tests.
- Decided with Mikael on 2026-11-08: the template lists the protocols' optional `note`, and a card with an unfinished `depends_on` cannot be picked (shared rule in `packages/shared`, used by the AI teammate and the API pick). The seed gained `invented-154` so the AI still has a card to pick.

## Waiting for Mikael

1. **Which past project for the Phase 2 run?** Not needed before ConCon on 2026-11-18. Recommendation: choose it in the week after ConCon and run Phase 2 before adding any template field for failed checks or waiting on another role, because that run is what shows whether those fields are needed.

## Next, in the suggested order

1. Build the board UI from the Main artboard on the API: columns, cards with mode pills, cycle log, live updates over `/api/events`. Run `design-reviewer` on it before handing back.
2. Wire the AI teammate into the API: write its run with the store's `appendEvents` so the five events land together, and add an endpoint or timer that triggers it.
3. Build card detail and the answer flow from the Card artboard.
4. Build the teammate profile from the Profile artboard, with modes read from the function files.
5. Run the API and web dev servers together and check the full loop on the seed: AI picks, asks, a person answers in the UI.
