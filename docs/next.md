# Next

Last updated 2026-11-08 by Claude.

## Where the work stands

- Process model: template v1 and the four segment functions are drafted; the 2026-10-26 review changes and the app docs are merged into `main` (not pushed).
- Phase 2, the hand run on a past project, has not started. Mikael is looking into which project to use.
- Product direction: build toward a working product. ConCon is on 2026-11-18; the talk is mostly about how AI and people should collaborate, and the app is shown as an example at whatever stage it has reached. Stack and model are in `docs/architecture.md`, the plan in `docs/plan.md`, the design snapshot in `docs/design/`.
- The build runs in Claude Code locally in this repo; `docs/plan.md` is the source of truth for the plan. The Workbench board artifact was retired on 2026-11-08 and now points here. See `docs/decisions.md`.
- `docs/tutorial-pnpm-hono-sse.md` introduces the proposed stack hands-on. Its playground server was run and typechecked on 2026-11-08.
- No app code yet.

## Waiting for Mikael

1. **Which past project for the Phase 2 run?** Recommendation: pick it before the scaffold is done, so the demo board can show real cards instead of invented ones. Mikael is investigating.
2. **pnpm, Hono and server-sent events, after trying the tutorial?** Recommendation: yes. pnpm handles workspaces strictly, Hono is small and typed with built-in SSE, and SSE is enough because the board only receives updates; actions go through normal requests.
3. **Replace the plan copy in the claude.ai project with a pointer to the repo?** Claude cannot reach the project doc from here. Recommendation: replace its text with "The plan lives in `docs/plan.md` in the workbench repo; this project is for design and discussion."

## Next, in the suggested order

1. Scaffold the TypeScript repo: pnpm workspaces with `apps/web`, `apps/api` and `packages/shared`, plus lint, typecheck and test scripts (blocked by question 2).
2. Add a `Stop` hook in `.claude/settings.json` that runs typecheck, tests and `checks/validate_functions.py`, so a turn cannot end while they fail.
3. Write the shared zod schemas: teammate, process profile, card, status with `waiting_on`, question, event.
4. Add a schema that loads the function files' front matter, and test it against all four function files.
5. Build the event store in SQLite through Drizzle, with card, board and cycle logs as queries. Seed it with example data marked as invented.
6. Build the API: board, pick, ask, answer, move status, and an SSE stream of events.
7. Build the board UI from the Main artboard: columns, cards with mode pills, cycle log, live updates.
8. Add a read-only `design-reviewer` subagent (Read, Grep, Glob) that compares a built screen with its artboard and the tokens in `docs/design/`. Add one line to `AGENTS.md` saying when to use it.
9. Add one AI teammate behind a provider interface: it picks a card, works it in `assist` mode and raises a question that moves the card to Needs input.
10. Build card detail and the answer flow from the Card artboard.
11. Build the teammate profile from the Profile artboard, with modes read from the function files.
12. Port the structural checks from `checks/validate_functions.py` to `packages/shared`; keep the Python version until both give the same results.
