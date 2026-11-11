---
template: 1
name: review_pull_request
role: team
title: Review and approve the change
summary: A person reads the pull request with an AI critic's findings beside it and approves it or sends it back, so nothing lands without a named person's decision.
inputs:
  - artifact: pull_request
    required: true
    from: open_pull_request
  - artifact: issues
    required: false
    from: write_issues
  - artifact: acceptance_criteria
    required: false
    from: write_handoff_spec
context:
  - artifact: codebase
    from: external
  - artifact: constraints
    from: external
  - artifact: api_contract
    from: define_api_contract
  - artifact: design_system
    from: maintain_design_system
tacit:
  - What the reviewer knows about where this codebase has broken before.
  - How much risk the team accepts for this kind of change right now, for example before a release.
outputs:
  - artifact: approved_change
checks:
  structural:
    - id: fields_filled
      rule: The approved_change has every field listed for it in artifacts.md.
    - id: approver_is_person
      rule: The approver is a person on the team and is not the author of the change.
    - id: checks_green
      rule: The project's continuous integration check passed on the commit that was approved.
    - id: findings_resolved
      rule: Every finding has a resolution, fixed or accepted on purpose.
  consistency:
    - id: card_done
      rule: The change does what the card and its acceptance criteria ask for; anything missing is a finding.
    - id: risky_parts_read
      rule: Every change to data, auth, money or a public contract has a comment or finding from the reviewer, showing it was read line by line.
    - id: fits_conventions
      rule: The change follows the codebase's conventions and the design system, or a finding says why not.
  human:
    approver: a named person who did not write the change
    where: on the code host, as an approving review
    criteria: The reviewer read the risky parts line by line, every finding is fixed or accepted on purpose, and they would be willing to explain the change to someone else.
modes:
  default: assist
  allowed: [manual, assist]
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
    note: An AI critic that has not seen the code being written reviews the pull request first and posts its findings as comments. The reviewer reads the change with the findings beside it, adds their own, and approves or requests changes. The critic never approves.
decision_log:
  - Findings accepted on purpose rather than fixed, and why.
  - Why changes were requested, if they were.
writes_back:
  - artifact: constraints
    what: Findings that recur across reviews, as a proposal to add them to team_conventions.
---

## Purpose

Review is where the team keeps its judgment over what lands, and with agents writing more of the code it is the step that matters most. A review that only skims, or that lets the AI approve, turns `decides: human` into a formality. This step puts a fresh AI critic in front of the reviewer, so routine findings are already listed, and leaves the reviewer's attention for the risky parts and the decision.

It serves frontend and backend changes alike, so its role is `team`; the map's review_frontend_pr and review_backend_pr are folded into one function, and what differs between them (design review notes for screens, security findings for services) is read from context. Requested changes are not an output: they send the card back to the building step, and this step is done only when a person approves.

The map suggests "AI assists, I drive", so the default is `assist`. `delegate` is not allowed: an AI that writes the review leaves the person only a button to press, which is the failure this step exists to prevent.

## How each mode plays out

**manual.** The reviewer reads the pull request alone and approves it or requests changes.

**assist.** An AI critic, given the pull request and the card but not the conversation that produced the code, posts its findings as comments: missing states, unhandled errors, drift from the contract or the design. The reviewer reads the change with those findings beside it, reads the risky parts line by line, resolves each finding as fixed or accepted, and approves. The critic never approves.

## Example

Invented example, continuing open_pull_request's.

```yaml
pull_request: "Show the status of a reported fault (card #121, invented)"
approver: backend developer (invented)
findings:
  - critic: The 503 response has no Retry-After header, which the contract lists.
  - reviewer: The state mapping treats an unknown contractor state as received.
resolution:
  - Retry-After added in a follow-up commit; fixed.
  - Unknown states are logged and shown as received; accepted on purpose, raised as a contract question.
```

## Open points

- Who may approve when one person holds every role, as on the workbench's own repository? The rule that the approver is not the author holds there only because the AI is the author of most changes.
- Should `approval_rules` (from define_quality_gates in the map) be drafted, so the approver for each kind of change is written down rather than named in this file?
