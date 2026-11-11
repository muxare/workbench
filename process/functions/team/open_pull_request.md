---
template: 1
name: open_pull_request
role: team
title: Open the change for review
summary: Turns a finished branch into a pull request that names its card, says how it was tested and where the risk is, so a reviewer can judge it quickly.
inputs:
  - artifact: service_code
    required: false
    from: implement_services
  - artifact: working_ui
    required: false
    from: implement_interactions
  - artifact: bug_fix
    required: false
    from: fix_bug
context:
  - artifact: codebase
    from: external
  - artifact: constraints
    from: external
tacit:
  - Which parts of the change the author is unsure about and wants a second look at.
  - What the reviewer already knows about the change from earlier conversations, so the description does not repeat it.
outputs:
  - artifact: pull_request
checks:
  structural:
    - id: fields_filled
      rule: The pull request has every field listed for pull_request in artifacts.md, as sections or front matter in its description.
    - id: one_change
      rule: The pull request is built from exactly one of service_code, working_ui or bug_fix.
    - id: card_named
      rule: The description names the card in the form the board recognizes.
    - id: checks_green
      rule: The project's continuous integration check passes on the pull request.
    - id: screenshots_for_ui
      rule: A pull request that changes a screen shows a screenshot of each state it changes.
      severity: warning
  consistency:
    - id: summary_matches_diff
      rule: The summary describes what the diff does; nothing significant in the diff is missing from it.
    - id: risks_named
      rule: Changes to data, auth, money or a public contract appear under risks.
    - id: testing_stated
      rule: How it was tested says what was run or clicked, not only that tests pass.
  human:
    approver: the author of the change
    where: on the code host, before asking for review
    criteria: The author would understand the pull request from its description alone, without the conversation that led to it.
modes:
  default: delegate
  allowed: [manual, assist, delegate]
protocols:
  manual:
    opens: human
    asks: none
    writes: human
    decides: human
  assist:
    opens: human
    asks: ai
    writes: human
    decides: human
    note: The author writes the description. The AI compares it with the diff and asks about risky changes not mentioned and testing that is not described.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The author says what the reviewer should look at first. The AI writes the title and description from the branch and the card, with screenshots for screens, and opens the pull request; the author reads it before asking for review.
decision_log:
  - What the author asked the reviewer to look at, and why.
---

## Purpose

A pull request is the point where the work leaves its author. A description that only lists files makes the reviewer rebuild the reasoning from the diff, and risky changes get the same glance as renames. This step makes every change arrive at review the same way: one card, one branch, a summary of what it does, how it was tested and where the risk is.

It takes the output of any of the three building steps, so its role is `team`. The map places it under frontend, with styled UI, frontend tests and an accessibility report as inputs; those steps are not drafted, and backend changes and bug fixes need the same step. The default is `delegate`, as the map suggests: writing the description is mechanical once the author has said what matters.

## How each mode plays out

**manual.** The author opens the pull request and writes the description.

**assist.** The author writes the description. The AI reads it against the diff and points out changes to data, auth or a contract that the risks section leaves out, and testing that is claimed but not described.

**delegate.** The author says in a sentence what the reviewer should look at first. The AI writes the description from the branch, the card and the diff, adds screenshots for each changed state of a screen, and opens the pull request. The author reads it before asking for review.

## Example

Invented example, continuing implement_services'. On a board that follows `docs/dev-loop.md`, the card is named as `Workbench: #<card id>`.

```markdown
## Show the status of a reported fault

Workbench: #121 (invented)
Branch: wb/121-fault-status-endpoint

**Summary.** Adds GET /faults/{faultId}/status, mapping the contractor's
work-order states to received, scheduled and fixed.

**How it was tested.** Contract tests for 200, 404 and 503; called the
endpoint against the contractor sandbox with a scheduled work order.

**Risks.** Auth: a tenant must not read another tenant's fault; there is a
test for it. The 503 path depends on the adapter's timeout of 3 seconds.
```

## Open points

- The template cannot say that exactly one of the three inputs is required, so all three are optional and the structural check `one_change` enforces it. If more functions need "one of these inputs", that is a case for a template field.
- The map has this step also produce a preview build. This repository has none, so `preview_build` is left out until a project needs it.
- In the development loop, is this a step on the same card as the building step, or a card of its own? See the open question in `docs/dev-loop.md`.
