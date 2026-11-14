---
template: 1
name: fix_bug
role: team
title: Fix a reported bug, with a test that proves it
summary: Reproduces a reported bug in a failing test, fixes it on its own branch, and states the cause, so the bug cannot quietly come back.
inputs:
  - artifact: bug_report
    required: true
    from: external
context:
  - artifact: codebase
    from: external
  - artifact: domain_rules
    from: external
tacit:
  - How the person who reported the bug actually uses the product, beyond the steps written down.
  - Earlier fixes in the same area and why they did not hold.
  - How urgent the bug is for the people it affects, which the severity field only approximates.
outputs:
  - artifact: bug_fix
checks:
  structural:
    - id: fields_filled
      rule: The bug_fix front matter has all fields listed for it in artifacts.md.
    - id: branch_named_for_card
      rule: The branch name contains the card id.
    - id: reproduces_before
      rule: The reproduction test fails on the commit the branch started from.
    - id: passes_after
      rule: The reproduction test passes at the head of the branch.
    - id: project_check_passes
      rule: The project's check command (lint, typecheck, tests) passes on the branch.
  consistency:
    - id: test_matches_report
      rule: The reproduction test follows the report's steps and asserts the expected behavior, not only the absence of the observed one.
    - id: cause_explains_bug
      rule: The cause stated explains everything observed in the report; a fix that removes the symptom without a cause is flagged.
    - id: smallest_change
      rule: The fix changes only what the cause requires; anything else is named in the summary.
  human:
    approver: the person who owns the area of code, with the reporter for the expected behavior
    where: on the branch, before the pull request is opened
    criteria: The person agrees with the cause, and the reporter, or someone speaking for them, agrees the expected behavior is right.
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
    note: The person investigates and fixes. The AI asks for a reproduction test before the fix, and questions a cause that does not explain all of the report.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The person says where they suspect the cause, or that they have no idea. The AI writes the failing test first, then the fix, and states the cause; when the expected behavior is unclear it asks on the card instead of choosing one.
decision_log:
  - The cause found, and other causes ruled out.
  - The expected behavior, if the report left it unclear, and who settled it.
---

## Purpose

A bug fixed without a test that reproduces it can come back with the next change, and a fix without a stated cause often hides the bug instead of removing it. This step makes every fix prove itself: a test that fails before the fix and passes after, and a cause that explains what the reporter saw.

The step serves both frontend and backend code, so its role is `team`; the person who owns the affected area does it. The map suggests "AI does it, I verify", so the default is `delegate`.

## How each mode plays out

**manual.** The person reproduces the bug in a test, fixes it on the card's branch and writes down the cause.

**assist.** The person works the bug. The AI asks for the failing test before any fix, checks that the test follows the report's steps, and asks what else the stated cause would break.

**delegate.** The person gives a hunch about where the bug lives, or says they have none. The AI writes the reproduction test, shows that it fails, fixes the code and states the cause. When the report does not say what should happen instead, the AI asks on the card rather than picking an answer. The person reads the cause and the diff.

## Example

Invented example, from the laundry room project. The card id #130 is invented.

```yaml
branch: wb/130-fixed-date-off-by-one
card: "#130"
cause: >
  The fixed date was stored as UTC midnight and shown in local time, so a
  fault fixed on 9 October showed as fixed on 8 October for tenants west of
  UTC.
reproduction_test: fault status shows the fixed date in the building's time zone
summary: Store and show status dates as calendar dates, not timestamps.
```

## Open points

- The map has fix_bug output a pull request directly. Here it outputs a branch, and open_pull_request makes the pull request, so every change reaches review the same way. Is that the right split?
