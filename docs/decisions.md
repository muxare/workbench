# Decisions

Newest first. Each entry: what was decided, why, and what would change it.

## 2026-11-08: Demo date, where the build runs, which plan copy counts (with Mikael)

- **ConCon is on 2026-11-18, and the talk is mostly about the idea of how AI should collaborate with people.** The app is shown as an example of that idea and does not have to be finished. The build order stays as it is; nothing is cut to make a date.
- **The build runs in Claude Code locally in this repo**, so the agent can run the dev server and Mikael can watch the UI. The claude.ai project is for design and discussion.
- **`docs/plan.md` in the repo is the source of truth for the plan.** The claude.ai project doc is replaced by a short pointer to the repo, so two copies cannot drift.
- **The Workbench board artifact is retired.** Its page now says so and points to `docs/next.md`, `docs/decisions.md` and `docs/plan.md`; its stored tasks remain and an earlier version can be republished. One tracker cannot drift from another.
- **pnpm, Hono and SSE stay open until Mikael has tried them.** `docs/tutorial-pnpm-hono-sse.md` was written for that; the scaffold waits for the answer.

## 2026-11-08: Agents, subagents, hooks and skills for building the app (with Mikael)

- **No standing role agents.** No "frontend agent" or "backend agent" with persona prompts. Claude Code splits work per task on its own (Explore, forks), and persona prompts would repeat what it knows and go stale as the stack settles. Anthropic's guidance agrees: start with ad hoc subagents, define a custom one only when the same kind keeps being requested, keep the set to a handful, and do not delegate expecting a better answer.
- **A custom subagent must add something asking cannot:** tool limits that Claude Code enforces, a fresh reviewer that has not seen the code, or a cheaper model for simple jobs.
- **Rules that must always hold become hooks; guidelines stay in `AGENTS.md`.** Keep both sets small.
- **Planned, in this order:** a `Stop` hook that runs typecheck, tests and the process validator once the repo is scaffolded; a read-only `design-reviewer` subagent once the first screen exists; skills for recurring procedures (refresh the design snapshot, add a new function). The built-in `/code-review` covers other reviews until a need repeats.
- **Build tooling is not the product's AI teammates.** The product's agents come from the function files and their protocols (one skill per function, per the plan). Instructions there are designed carefully; build tooling stays minimal.
- What would change it: the same correction or review request coming up twice. Then add the narrowest agent, skill or hook that fixes it, and record it here.

Sources: https://claude.com/blog/how-and-when-to-use-subagents-in-claude-code, https://code.claude.com/docs/en/best-practices

## 2026-11-08: From process model to product (with Mikael)

Details in `docs/architecture.md`.

- **Build toward a working product and demo it at ConCon at whatever stage it has reached.** The demo shows real progress, not a mock.
- **The first UI is the Claude Design concept "AI teammate on the team board".** Board, card lifecycle, card detail and teammate profile. The design also shapes the backend model.
- **Start the UI before the phase 3 gate, as a shell that reads the function files.** The plan said to wait until the template stops changing. Reading the YAML front matter instead of hardcoding fields keeps template changes flowing into the UI. Would change if the shell starts hardcoding function fields.
- **Full-stack TypeScript.** One set of types for UI and API, zod schemas for the function files, typed code guards AI-written changes, and the AI SDKs are first-class in TypeScript. .NET was considered and rejected because the frontend would still be TypeScript and the shared types would be lost. Evals may stay in Python on the side.
- **Port the structural checks to TypeScript.** The API must run them on every draft, and two implementations would drift. The Python validator stays until the port matches it.
- **The three logs (card, board, cycle) are views of one append-only event stream.** It also feeds the learning layer.
- **The AI is a teammate in the data model** (`kind: ai`), working in the mode of the step's owner. Deciding stays human.
- **`needs_input` is a status with `waiting_on`**, a person or an AI. This reopens the 2026-10-26 decision not to model waiting yet; the design needs it.
- **Own board first, external trackers later.** Card storage sits behind an interface so GitHub Issues can be the source later. This departs from the plan's "task tracking stays in GitHub or Jira"; would change if the demo needs real issues.
- **`docs/next.md` tracks where the work stands, what waits for Mikael and what comes next.** Instructions in `AGENTS.md`.

## 2026-10-26: First review of the segment drafts (with Mikael)

- **Artifact files keep their fields in YAML front matter**, prose below. Structural checks read only the front matter. Convention in `docs/runs.md`.
- **Human sign-off is recorded in `approval.md` in each step folder of a run.** A run convention, not a template field.
- **Failed checks and waiting on another role are not modeled yet.** We add fields for them only if the Phase 2 run shows they are needed.
- **`writes_back` creates a proposal that the owning role accepts or rejects.** It never edits another role's artifact directly.
- **Structural rules can be `severity: warning`.** Used for rules code can only approximate. frame_problem's solution word list became a warning; a new consistency rule makes the real call.
- **Team habits such as issue size live in `constraints.team_conventions`**, not in function rules.
- **define_api_contract takes `issues` as optional.** The refined UI spec already lists the data needed.

## 2026-10-23: Phase 0 and 1 drafts (made by Claude while Mikael was away, to review)

- **Function files are markdown with YAML front matter.** Readable by people, parseable by the validator, skills and a later UI. Would change if the front matter grows too large to read, then move to YAML plus a separate notes file.
- **Mode names in files are `manual`, `assist`, `delegate`.** They match the process map's "I do it", "AI assists, I drive", "AI does it, I verify".
- **Protocol roles take `human`, `ai`, `both` or `none`, and `decides` is always `human`.** The validator enforces it.
- **Required artifact fields are defined once, in `artifacts.md`.** Function files list artifact ids only, so a field is never defined twice.
- **Inputs carry `from`, and the validator checks it against `made_by`.** That keeps the chain's links consistent as functions are added.
- **`writes_back` is a new optional field.** It records tacit knowledge to copy into a context artifact after a step (from the frame_problem discussion: the conversation is an artifact).
- **`write_issues` takes `ui_spec` and `acceptance_criteria` as inputs**, not only the problem framing. Issues need testable criteria, which come from the handoff spec.
- **Open questions are split by who must answer:** `client_questions`, `design_questions`, `contract_questions`.
- **Default modes in the segment:** frame_problem `assist`, write_issues `delegate`, refine_ui_spec `assist`, define_api_contract `assist`. The process map suggested `manual` for frame_problem; `assist` fits the agreed idea that the AI asks while the designer writes.
