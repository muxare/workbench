---
template: 1
status: draft
---

# Function template, version 1

Every step in a role's chain is described as a **function**: it reads artifacts, writes artifacts, and is done when its checks pass. A person, an AI or both carry it out, according to the mode the team picks.

Each function lives in `process/functions/<role>/<name>.md`. The file is markdown with YAML front matter. The front matter holds the fields a machine reads (the validator, Claude Code skills, later the UI). The body holds what people read: purpose, how each mode plays out, and examples.

How artifacts, approvals and proposals are stored during a run is described in `docs/runs.md`.

Run `python3 checks/validate_functions.py` after any change. It checks every function file against this template and against `process/artifacts.md`.

## Front matter fields

| Field | Required | What it holds |
| --- | --- | --- |
| `template` | yes | The template version the file follows. Currently `1`. |
| `name` | yes | snake_case function name. Must match the file name. |
| `role` | yes | `ux`, `fe`, `be` or `team`. Must match the folder. |
| `title` | yes | Plain-language name of the step. |
| `summary` | yes | One sentence: what the step produces and why. |
| `inputs` | yes | Artifacts the step reads and that change from run to run. Each: `artifact` (id from `artifacts.md`), `required` (true/false), `from` (the function that makes it, or `external`). |
| `context` | no | Standing artifacts the step reads but never changes (design system, constraints, codebase). Same shape as inputs, without `required`. |
| `tacit` | no | Knowledge that only arrives through conversation with the person doing the step. A list of plain sentences. The AI must ask for these; it cannot read them from files. |
| `outputs` | yes | Artifacts the step writes. Each: `artifact` (id). The fields each artifact must have are defined once, in `artifacts.md`. |
| `checks.structural` | yes | Deterministic rules run on every draft, by code, not AI. Each: `id`, `rule`, and optionally `severity`: `error` (default, blocks the step) or `warning` (shown, does not block). Use `warning` for rules code can only approximate, such as word lists. |
| `checks.consistency` | yes | Rules an AI critic checks on every draft (traceability, contradictions). Each: `id`, `rule`. |
| `checks.human` | yes | `approver` (who signs off), `where` (in the tool, in a meeting), `criteria` (what they confirm). |
| `modes.default` | yes | The suggested mode: `manual`, `assist` or `delegate`. |
| `modes.allowed` | yes | Which modes the team allows for this step. |
| `protocols` | yes | One entry per allowed mode, with four roles: `opens`, `asks`, `writes`, `decides`. Values: `human`, `ai`, `both`, or `none`. `decides` is always `human`. |
| `decision_log` | yes | What is kept from the conversation after the step is done. |
| `writes_back` | no | Tacit knowledge to carry into a context artifact after the step, so the next run starts with it. Each: `artifact`, `what`. It creates a **proposal**; the role that owns the artifact accepts or rejects it (see `docs/runs.md`). |

## The three modes as conversation protocols

A mode does not decide whether people and AI talk. It decides who opens the work, who asks the questions, who writes the output and who decides.

| Mode | Opens | Asks | Writes | Decides |
| --- | --- | --- | --- | --- |
| `manual` (I do it) | human | none, or AI reviewing the finished draft | human | human |
| `assist` (AI assists, I drive) | human | AI asks and challenges | human | human |
| `delegate` (AI does it, I verify) | human, with a first move | human corrects, AI asks about gaps | AI drafts, human edits | human |

Two rules for `delegate` mode, to keep the person's judgment in the work:
- **The human makes the first move.** A sentence of intent, a hunch, a constraint. The AI builds from that instead of replacing it.
- **Where the step is a judgment call, the AI offers alternatives.** Two or three options make the person choose and argue, which is the judgment.

## The three checks

1. **Structural.** Code checks shape: required fields filled, numbers where numbers belong, forbidden words absent. Cheap, deterministic, run on every draft.
2. **Consistency.** An AI critic checks meaning: each output traces to an input, nothing contradicts. Runs on every draft after the structural check passes.
3. **Human.** A named person approves. Only drafts that pass 1 and 2 reach them.

## Body sections

Each function file's body has these sections, in this order:

- `## Purpose`: why the step exists and what goes wrong without it.
- `## How each mode plays out`: one short paragraph per allowed mode.
- `## Example`: a short worked example of the outputs. Mark invented examples as invented.
- `## Open points`: what is still undecided about this function.

## Changing the template

A new field means a new template version. Bump `template` here, record why in `docs/decisions.md`, and update every function file. The plan says to start building the UI when two or three functions in a row need no new fields.
