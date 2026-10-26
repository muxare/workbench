# Workbench

A workbench where people and AI do a team's work together, one step at a time. Each step in a role's chain (UX, frontend, backend) is a **function**: it reads artifacts, writes artifacts, is done when its checks pass, and follows a conversation protocol that says who opens, who asks, who writes and who decides.

The full plan lives in the claude.ai project "Collabborating with AI" (`claude/human-ai-workbench-plan.md`).

## Where things are

| Path | What it holds |
| --- | --- |
| `process/template.md` | The function template, version 1. Read this first. |
| `process/artifacts.md` | Every artifact the functions read or write, with owner, maker and required fields. |
| `process/functions/<role>/<name>.md` | One file per function. |
| `checks/validate_functions.py` | Checks every function file against the template and the artifact list. |
| `docs/decisions.md` | Decisions about the process model, newest first. |
| `runs/` | One folder per feature run through the chain (from phase 2). |

## Status

Phase 0 (template) is drafted. Phase 1 (the first segment) is drafted:

1. `ux/frame_problem`: frame the problem and success criteria
2. `team/write_issues`: turn intent into issues
3. `fe/refine_ui_spec`: turn the issue into a buildable UI spec
4. `be/define_api_contract`: agree the API contract

All four are first drafts to refine together.

## Check the process files

```
pip install pyyaml
python3 checks/validate_functions.py
```

It prints errors (the file breaks the template) and notes (outputs that no drafted function reads yet; expected while only one segment exists).
