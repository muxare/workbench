# Runs

A run takes one feature through the chain. It lives in `runs/<feature>/`, one folder per step, numbered in the order the steps ran.

```
runs/<feature>/
  01-frame_problem/
    inputs/              # copies or links of the input and context artifacts used
    outputs/             # one file per output artifact
    decision-log.md      # what was kept from the conversation
    check-report.md      # results of the structural and consistency checks
    approval.md          # the human sign-off
    proposals/           # writes_back proposals for artifacts other roles own
  02-write_issues/
    ...
```

## Artifact files

Each artifact is a markdown file named after its id (`outputs/problem_statement.md`). Its YAML front matter holds the fields listed in `process/artifacts.md`; prose for people goes below. Table-like fields are lists of objects:

```markdown
---
artifact: success_criteria
criteria:
  - metric: Repeat calls about the same fault
    baseline: 40% of fault calls
    target: 15%
    deadline: 2027-06-30
    method: Service desk call log
---

Notes for the reader.
```

Structural checks read only the front matter.

## approval.md

```markdown
---
approver: <name and role>
date: <YYYY-MM-DD>
decision: approved | approved with changes | sent back
where: <in the tool, or the meeting it happened in>
---

What the approver changed or asked for.
```

A step is done when its checks pass and `approval.md` says approved.

## Proposals

`writes_back` never edits another role's artifact directly. It writes a file in `proposals/`, named after the target artifact, stating the change and why. The owning role accepts it (and applies the change to the context artifact) or rejects it, and records which at the bottom of the proposal.
