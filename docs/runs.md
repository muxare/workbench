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

`writes_back` never edits another role's artifact directly. It writes a file in `proposals/`, named after the target artifact, stating the change and why. The owning role accepts it (and applies the change to the context artifact) or rejects it.

A proposal's front matter says where it stands, so a later step can find it without reading the prose:

```markdown
---
proposal_for: constraints
proposed_by: <name and role>
date: <YYYY-MM-DD>
status: open | accepted | rejected
decided_by: <name and role, once decided>
decided_on: <YYYY-MM-DD, once decided>
---

The change, and why.
```

### Open proposals are read with the artifact

A proposal is open from the day it is written until the owner accepts or rejects it, and a step may start in that time. So a step reads each artifact in its `inputs` and `context` together with every open proposal against it, from any run, because standing context such as `constraints` is shared by every run of the team. The step then:

- copies each open proposal into its `inputs/` folder beside the artifact, so the run shows what it saw;
- shows the open proposals to the person and the AI as pending: not part of the artifact yet, and not to be ignored;
- where a draft would contradict an open proposal, says so in `decision-log.md` and tells the approver, who decides whether to wait for the owner, follow the proposal or follow the artifact as it stands.

This is a rule about runs, not a template field: every function already declares the artifacts it reads, so no function file has to change for it (decided 2026-11-12).
