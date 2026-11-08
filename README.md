# Workbench

A workbench where people and AI do a team's work together, one step at a time. Each step in a role's chain (UX, frontend, backend) is a **function**: it reads artifacts, writes artifacts, is done when its checks pass, and follows a conversation protocol that says who opens, who asks, who writes and who decides.

The full plan is in `docs/plan.md`. The claude.ai project "Collabborating with AI" points here instead of keeping its own copy.

## Where things are

| Path | What it holds |
| --- | --- |
| `process/template.md` | The function template, version 1. Read this first. |
| `process/artifacts.md` | Every artifact the functions read or write, with owner, maker and required fields. |
| `process/functions/<role>/<name>.md` | One file per function. |
| `packages/shared/src/functionValidator.ts` | Checks every function file against the template and the artifact list (`pnpm validate`). |
| `docs/next.md` | Where the work stands, what waits for Mikael, what comes next. Read this first. |
| `docs/plan.md` | Goal, decisions and phases. |
| `docs/architecture.md` | The app: stack, layout, domain model, first slice. |
| `docs/design/` | Snapshot of the Claude Design concept the first UI follows, plus design tokens. |
| `docs/decisions.md` | Decisions about the process model and the app, newest first. |
| `docs/runs.md` | How a run is stored: artifact files, approvals, proposals. |
| `docs/tutorial-pnpm-hono-sse.md` | Hands-on introduction to pnpm, Hono and server-sent events. |
| `runs/` | One folder per feature run through the chain (from phase 2). |

## Status

Phase 0 (template) is drafted. Phase 1 (the first segment) is drafted:

1. `ux/frame_problem`: frame the problem and success criteria
2. `team/write_issues`: turn intent into issues
3. `fe/refine_ui_spec`: turn the issue into a buildable UI spec
4. `be/define_api_contract`: agree the API contract

All four are first drafts to refine together.

From 2026-11-08 the repo also grows the app: full-stack TypeScript, with the first UI following the Claude Design concept. See `docs/architecture.md`, and `docs/next.md` for current status.

## Run the app

Needs Node 22 or later and pnpm 11 (`npm install -g pnpm`).

```
pnpm install
pnpm dev      # API on :3000, web on :5173 with /api proxied to the API
pnpm check    # lint, typecheck, tests and the process validator
```

## Check the process files

```
pnpm validate
```

It prints errors (the file breaks the template) and notes (outputs that no drafted function reads yet; expected while only one segment exists).
