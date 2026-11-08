# Workbench: notes for coding agents

This repo defines a team's work as chains of functions that people and AI carry out together. It holds the process model (`process/`) and, from November 2026, the app built on it. The app's stack and model are in `docs/architecture.md`.

`CLAUDE.md` imports this file, so Claude Code, Codex and other agents follow the same rules. Put shared instructions here, not in `CLAUDE.md`.

## Start and end of every session

- Read `docs/next.md` first. It says where the work stands, what waits for Mikael and what comes next.
- Update `docs/next.md` before you end a session or hand back to Mikael, in the same change as the work. The rules are below.

## Tracking work: `docs/next.md`

`docs/next.md` is the one place that says where the work stands and what comes next. It has exactly three sections, in this order:

1. **Where the work stands.** Short facts about the current state: done, in progress, broken. Replace lines that are no longer true; do not append a diary. History lives in git and `docs/decisions.md`.
2. **Waiting for Mikael.** Numbered questions only Mikael can answer. Each one gets a recommendation and the reason for it, written as "Recommendation: …". When a question is answered, remove it and record the answer where it belongs: a decision goes in `docs/decisions.md`, a task goes in the list below.
3. **Next, in the suggested order.** A numbered list of tasks, most important first. Each task starts with a verb and fits in one session. When a task is done, remove it and note the result in "Where the work stands".

Rules:

- Put the date and who updated it under the title.
- Do not start a task that depends on an open question. Mark it "(blocked by question N)" and take the next one.
- If Mikael reorders the list, keep his order.
- Keep the file short enough to read in a minute.

## Agents, subagents, hooks and skills

- Do not add role agents or persona prompts. Split work into subagents per task when it helps: parallel independent work, long noisy output, or a review by someone who has not seen the code.
- Add a custom subagent in `.claude/agents/` only when the same kind of request has come up at least twice, and only if it adds tool limits, fresh eyes or a cheaper model. Keep the set small.
- A rule that must hold every time goes in a hook, not in this file. Keep hooks few.
- A repeatable procedure goes in a skill under `.claude/skills/`.
- Record every new agent, hook or skill, and why, in `docs/decisions.md`.

## Process model

- Read `process/template.md` before editing any function file. Follow its fields and body sections exactly.
- Refer to artifacts by `id` from `process/artifacts.md`. Add new artifacts there first.
- After any change under `process/`, run `python3 checks/validate_functions.py` and fix every error.
- In every protocol, `decides` is `human`. Never change that.
- Do not invent facts about real clients or projects. Mark examples as invented.
- A change that needs a new template field: bump the version in `process/template.md`, update every function file, and add an entry to `docs/decisions.md`.

## App

- The UI follows `docs/design/`. Read the artboard and the tokens before building its screen. Treat the `.dc.html` files as reference, not code to copy.
- App code is TypeScript. Types shared by the UI and the API live in `packages/shared`; do not copy them.
- Run `pnpm check` (lint, typecheck, tests, process validator) before you hand back, and fix every failure.
- A dependency that needs install scripts goes under `allowBuilds` in `pnpm-workspace.yaml` only when the task needs it; say why in the change.
- The app reads function definitions from `process/`. Never hardcode a function's fields in app code.
- Store events, not logs. The card, board and cycle logs are queries over the event stream.
- Record decisions about the app in `docs/decisions.md`, like process decisions.
