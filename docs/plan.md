# Human-AI Workbench: Implementation Plan

As of 2026-11-08 · Mikael Axelsson

This file is the source of truth for the plan (decided 2026-11-08). The claude.ai project "Collabborating with AI" keeps only a short pointer here, so the two cannot drift.

## Status

Current status, open questions for Mikael and the next tasks live in `docs/next.md`. This plan holds the goal, decisions and phases.

2026-11-08: The direction is now a working product, built on the process model and demoed at ConCon on 2026-11-18 at whatever stage it has reached. The first UI follows the Claude Design concept in `docs/design/`. The stack is full-stack TypeScript. Stack, layout, domain model and first slice are in `docs/architecture.md`; reasons are in `docs/decisions.md`.

2026-10-23: Phase 0 and Phase 1 were drafted. The template is version 1, in markdown with YAML front matter. All four segment functions were reviewed on 2026-10-26.

## Goal and scope

Build a workbench where people and AI do a team's work together, one step at a time. Each step is a function with inputs, outputs, a check, and a conversation protocol that says who writes, who asks and who decides.

Phase 1 covers one chain segment that crosses roles: frame_problem → write_issues → refine_ui_spec → define_api_contract.

## Decisions so far

The function model comes first, because the UI is generated from it and the model is still changing. Each decision with its reasons is in `docs/decisions.md`.

- **Functions before UI, with one exception.** The UI starts before the phase 3 gate as a shell that reads the function files' front matter, so template changes flow into it.
- **Build toward a product; demo it at ConCon as it stands.** The first UI is the Claude Design concept: board, card lifecycle, card detail, teammate profile.
- **Full-stack TypeScript.** React and Vite, Node and Hono, shared zod schemas, SQLite through Drizzle. Structural checks move from Python into the shared package.
- **The board is the hub, and the AI is a teammate.** Humans and the AI pick cards; each person's process profile sets the mode the AI works in. A question to a person or an AI moves the card to Needs input.
- **One event stream, three logs.** The card, board and cycle logs are views of the same append-only events, which also feed the learning layer.
- **Own board first, external trackers later.** Card storage sits behind an interface so GitHub Issues can be the source later.
- **Artifacts are the unit.** A function is defined by the artifacts it reads and writes. A handoff is an artifact made in one role and used in another.
- **Modes are conversation protocols, not automation levels.** Each mode sets who opens the work, who asks, who writes and who decides. Deciding stays human.
- **Every function has a three-layer check.** A structural check in deterministic code, a consistency check by an AI critic, then human approval.
- **The conversation is an artifact.** It is saved as a decision log. Tacit knowledge it surfaces is written back into the inputs for the next run.
- **It complements the dependency tree builder.** The tree says what to work on next; the chain says how each item gets made.
- **Minimal build tooling.** No standing role agents. A Stop hook enforces typecheck, tests and the validator; one read-only design reviewer and a few skills are added when the need repeats. The product's AI teammates come from the function files instead.
- **Work is tracked in `docs/next.md`.** Agent instructions live in `AGENTS.md`, which `CLAUDE.md` imports.

## The function template

Every function is described with the same fields; `process/template.md` is the authoritative version. frame_problem is the first worked example.

| Field | What it holds | frame_problem |
| --- | --- | --- |
| Name and role | Function name and the role that owns it | frame_problem, UX |
| Inputs | Artifacts read, each required or optional, with the step that makes it | Client brief (required, from outside), Business goals (required, from outside), Launch insights (optional, from analyze_launch) |
| Context | Standing artifacts read but not changed | Constraints: time, budget, technology, regulation; stakeholder context |
| Tacit inputs | What only arrives through conversation | Who decides, what is sensitive, what was said but not written down |
| Outputs | Artifacts written, with their required fields | Problem statement; Success criteria; Assumptions to test; Non-goals; Open questions for the client |
| Structural check | Deterministic rules, run on every draft | Every field filled; every criterion has a number and a date; no solution words in the problem statement |
| Consistency check | An AI critic, run on every draft | Statement traces to the brief; criteria trace to the goals; contradictions flagged |
| Human check | Who approves, and where | Designer approves; stakeholders agree in a meeting |
| Protocol: I do it | Who opens, asks, writes, decides | Designer writes; AI reviews the finished draft; designer decides |
| Protocol: AI assists | Same four roles | Designer writes; AI asks and challenges while they write; designer decides |
| Protocol: AI does it | Same four roles | Designer writes a one-sentence hunch; AI drafts two or three framings and lists what it guessed; designer corrects, chooses and decides |
| Decision log | What is kept from the conversation | Questions asked, answers given, the framing chosen and why |

The template is versioned. A new field means a new template version, and every drafted function is checked against it.

## Phases

Six phases, each closed by a gate. Each phase feeds back to the template when it finds a missing field. Since 2026-11-08 the UI shell from phase 4 is built alongside phases 2 and 3, reading the function files rather than hardcoding them.

| Phase | Work | Gate to move on |
| --- | --- | --- |
| 0 · Template | Write the function template and the artifact vocabulary. | It holds every field frame_problem needed. |
| 1 · Draft the segment | Define the four functions and their three handoffs. | All four have inputs, outputs, checks and protocols. |
| 2 · Run it by hand | Run the segment as Claude Code skills on a past project. | One full run with decision logs and check reports; gaps listed. |
| 3 · Stabilize and extend | Fix the template, then draft the remaining functions. | Two or three functions in a row need no new template fields. |
| 4 · Build the UI | Board, card detail and teammate profile, generated from the template. | A second run goes through the UI end to end. |
| 5 · Learn from runs | Track check failures, rework and review time per step. | Data shows where a step's mode should move. |

## Open questions

The live list of questions for Mikael, with recommendations, is in `docs/next.md`. Longer-range questions:

- [ ] During a run, do artifacts live only as repo files, or also as links to Figma and Docs?
- [x] Claude Code only at first, or model-agnostic from the start? Instructions live in `AGENTS.md` for every agent; the app's AI sits behind a provider interface.
- [ ] What does the learning layer record from the first run: check failures, rework, review time?
- [ ] When, if ever, does the workbench merge with the dependency tree builder?

## References

- [Team process map](https://claude.ai/artifact/XcK8U1F2A9dM4ub1KLq2fA): every role as a chain of functions with inputs, outputs, checks and modes.
- [Team feedback loops](https://claude.ai/artifact/UzXyLRXQDQqNRXHjkCeGy6): the four loops between stakeholders, UX, frontend and backend, and how each changes with AI.
- [AI teammate on the team board](https://claude.ai/artifact/Wh1XCBD4Bdw8Gr7kbAfq4t): the live Claude Design canvas; snapshot and tokens in `docs/design/`.
- [Workbench board](https://claude.ai/artifact/WdB9brqt51zGQjWHmXvc1h): earlier live task board, superseded by `docs/next.md` unless Mikael decides otherwise (question 5 in `docs/next.md`).
