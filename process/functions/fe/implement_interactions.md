---
template: 1
name: implement_interactions
role: fe
title: Make every state of the screen work
summary: Wires the screen's components to data and behavior on its own branch, so every state in the refined spec works, including errors.
inputs:
  - artifact: refined_ui_spec
    required: true
    from: refine_ui_spec
  - artifact: ui_components
    required: false
    from: scaffold_components
  - artifact: api_mocks
    required: false
    from: agree_contract
  - artifact: acceptance_criteria
    required: false
    from: write_handoff_spec
context:
  - artifact: design_system
    from: maintain_design_system
  - artifact: api_contract
    from: define_api_contract
  - artifact: codebase
    from: external
tacit:
  - How the developer wants state owned and passed between components on this screen.
  - Interactions the designer showed in a call or a prototype but did not write into the spec.
  - Devices, browsers or network conditions the team knows cause trouble.
outputs:
  - artifact: working_ui
checks:
  structural:
    - id: fields_filled
      rule: The working_ui front matter has all fields listed for it in artifacts.md.
    - id: branch_named_for_card
      rule: The branch name contains the card id.
    - id: project_check_passes
      rule: The project's check command (lint, typecheck, tests) passes on the branch.
    - id: states_listed
      rule: Every state the refined spec lists for the screen appears in the states field, marked working or left out with a reason.
    - id: no_hardcoded_values
      rule: No colour, spacing or font value in the change is written by hand where a design token exists.
      severity: warning
  consistency:
    - id: states_work
      rule: Each state marked working can be reached and behaves as the refined spec says, including loading and error.
    - id: data_from_contract
      rule: Every piece of data the screen shows is read through an endpoint in the API contract or its mock, not invented in the client.
    - id: no_silent_change
      rule: Any difference from the refined spec is listed in the summary or raised as a design question.
  human:
    approver: frontend developer who owns the screen
    where: in the running app, on the card's branch
    criteria: The developer has clicked through every state, including the error and empty ones, and the screen matches the artboard closely enough to send for review.
modes:
  default: assist
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
    note: The developer builds the interactions. The AI keeps the refined spec's list of states beside the code and asks about states not yet reachable, data with no endpoint and hand-written values that have a token.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The developer names the screen and how state should be owned. The AI wires the components, writes the tests and lists each state as working or not; the developer clicks through them in the running app.
decision_log:
  - States left out or changed, and who agreed.
  - Design questions raised while building and the answers.
writes_back:
  - artifact: design_system
    what: Components or states the screen needed that the design system lacks, as a proposal for the UX owner to accept or reject.
---

## Purpose

A screen that looks right in the success state is easy to build; the work is in the states around it. Loading, empty, error and partial data are where the user gets stuck and where frontend work is usually unfinished when it is called done. This step makes each state from the refined spec reachable and working before the change goes to review.

The map suggests "AI assists, I drive", so the default is `assist`. How state is owned and how the screen feels to use are the developer's craft.

## How each mode plays out

**manual.** The developer builds the interactions on the card's branch and lists the states they made work.

**assist.** The developer builds. The AI follows along with the refined spec and the contract and points out states that cannot yet be reached, data the screen shows without an endpoint, and values written by hand where a token exists.

**delegate.** The developer names the screen and says in a sentence how state should be owned. The AI wires the components to the API or its mocks, writes tests for each state and fills in the states list. The developer runs the app and clicks through every state before the pull request is opened.

## Example

Invented example, continuing refine_ui_spec's. The card id #122 is invented.

```yaml
branch: wb/122-fault-detail-status
card: "#122"
screens: [Fault detail]
states:
  - loading: working
  - error: working (status unavailable shows the date reported and the service desk number)
  - success: working for received, scheduled and fixed
  - empty: left out, the screen opens from an existing report
tests:
  - one component test per state, against the mock for /faults/{faultId}/status
```

## Open points

- `ui_components` and `api_mocks` come from scaffold_components and agree_contract, which are not drafted. On a project without them, the screen is built from the codebase and the real API. Should the two steps be drafted before this one is used on a real project?
- The map has style_layout, accessibility_pass and write_frontend_tests between this step and the pull request. Until they are drafted, their work happens here or in review. Is that acceptable for small screens?
