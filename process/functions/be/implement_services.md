---
template: 1
name: implement_services
role: be
title: Build the service behind the contract
summary: Writes the backend code for one task on its own branch, with tests, so the contract the frontend builds against is served for real.
inputs:
  - artifact: tasks
    required: true
    from: write_spec_and_tasks
  - artifact: backend_spec
    required: false
    from: write_spec_and_tasks
  - artifact: api_contract
    required: false
    from: define_api_contract
context:
  - artifact: codebase
    from: external
  - artifact: constraints
    from: external
  - artifact: domain_rules
    from: external
tacit:
  - Which parts of the codebase are fragile or about to be replaced, and should be touched as little as possible.
  - How the team prefers to split a change into commits and how much to refactor on the way.
  - Data or load facts about production that are not written down anywhere.
outputs:
  - artifact: service_code
checks:
  structural:
    - id: fields_filled
      rule: The service_code front matter has all fields listed for it in artifacts.md.
    - id: branch_named_for_card
      rule: The branch name contains the card id.
    - id: project_check_passes
      rule: The project's check command (lint, typecheck, tests) passes on the branch.
    - id: contract_tests_pass
      rule: Where the task touches an endpoint in the API contract, the contract tests for that endpoint pass.
    - id: tests_added
      rule: The branch adds or changes at least one test.
      severity: warning
  consistency:
    - id: task_done
      rule: The change does what the task says and its acceptance test covers it; nothing in the task is left out without saying why.
    - id: contract_kept
      rule: Every response and error the change serves matches the API contract, or the difference is raised as a contract question.
    - id: rules_respected
      rule: No code path lets a caller break a domain rule.
    - id: no_scope_creep
      rule: The change does no work the task does not ask for, apart from refactoring it names in the summary.
  human:
    approver: backend developer who owns the task
    where: on the branch, before the pull request is opened
    criteria: The developer has read the diff, the tests fail without the change, and the summary says what a reviewer should look at first.
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
    note: The developer writes the code. The AI reads the task, the contract and the diff and asks about unhandled errors, missing tests and broken domain rules.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The developer states the approach in a sentence (where the code goes, what to reuse). The AI writes the code and tests on the card's branch and asks on the card when the task or contract does not settle a choice; the developer reads the diff before the pull request is opened.
decision_log:
  - Questions the AI asked on the card and the answers.
  - Places where the code departs from the backend spec or the contract, and who agreed.
writes_back:
  - artifact: constraints
    what: Data, load or security limits found while building, as a proposal for the team to accept or reject.
---

## Purpose

Once the contract and the task are settled, building the service is mostly execution, and it is the step where an agent saves the most time. What goes wrong is a change that passes its own tests but drifts from the contract, breaks a domain rule nobody tested, or grows beyond the task. This step keeps the change to one task on one branch, ties it to the contract by tests, and leaves a summary that tells the reviewer where to look.

The map suggests "AI does it, I verify", so the default is `delegate`. The developer's judgment is in the approach and in reading the diff, not in typing the code.

## How each mode plays out

**manual.** The developer writes the code and tests on the card's branch. The checks run on the branch as for any other draft.

**assist.** The developer writes. The AI keeps the task, the contract and the domain rules beside the diff and asks about error responses the contract lists but the code does not return, rules no test covers, and work outside the task.

**delegate.** The developer says in a sentence where the change belongs and what to reuse. The AI writes the code and tests on the card's branch, asks on the card when a choice is not settled by the task or the contract, and writes the summary. The developer reads the diff and either asks for changes or lets the pull request be opened.

## Example

Invented example, continuing define_api_contract's. The card id #121 is invented.

```yaml
branch: wb/121-fault-status-endpoint
card: "#121"
summary: >
  Adds GET /faults/{faultId}/status. Reads the work order from the contractor
  adapter and maps its states to received, scheduled and fixed. Returns 503
  when the adapter times out. Look first at the state mapping in
  faults/status.ts.
tests:
  - contract test for 200, 404 and 503
  - unit test: a tenant cannot read another tenant's fault (a domain rule)
```

## Open points

- `tasks` and `backend_spec` come from write_spec_and_tasks, which is not drafted. Until it is, a card's description stands in for the task, and on a project without a backend spec the input is left out. Is that enough, or should the card itself be an artifact?
- Should the developer's read of the diff be its own human check here, or is the review of the pull request enough?
