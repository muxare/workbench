---
template: 1
name: write_issues
role: team
title: Turn intent into issues
summary: Breaks the framed problem and the handoff spec into small, testable issues that people and agents can pick up.
inputs:
  - artifact: problem_statement
    required: true
    from: frame_problem
  - artifact: success_criteria
    required: true
    from: frame_problem
  - artifact: ui_spec
    required: true
    from: write_handoff_spec
  - artifact: acceptance_criteria
    required: true
    from: write_handoff_spec
  - artifact: non_goals
    required: false
    from: frame_problem
context:
  - artifact: codebase
    from: external
  - artifact: constraints
    from: external
tacit:
  - How big a piece the team usually takes on at once.
  - Which parts the team wants to build by hand and which it will hand to agents.
  - Known dependencies between teams or systems not visible in the spec.
outputs:
  - artifact: issues
checks:
  structural:
    - id: fields_filled
      rule: Every issue's front matter has all fields listed for issues in artifacts.md.
    - id: has_acceptance
      rule: Every issue links at least one acceptance criterion.
    - id: has_success_link
      rule: Every issue links at least one success criterion.
    - id: size_within_convention
      rule: Every issue's size is within the largest size allowed by team_conventions in constraints. Larger issues are split before the check passes.
  consistency:
    - id: spec_covered
      rule: Every acceptance criterion is covered by at least one issue.
    - id: no_non_goal_work
      rule: No issue does work listed as a non-goal.
    - id: role_fits
      rule: The role on each issue matches the work it describes.
  human:
    approver: team lead or the team together
    where: in a short refinement session
    criteria: The team agrees the issues are small enough, complete and in a sensible order.
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
    note: The AI points out uncovered acceptance criteria and issues that are too large.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: A person states the slicing approach (by screen, by user flow, by layer). The AI drafts the issues and a coverage table; the team edits and orders them.
decision_log:
  - The slicing approach chosen and why.
  - Issues merged, split or dropped during refinement.
writes_back:
  - artifact: constraints
    what: Dependencies on other teams or systems discovered while slicing.
---

## Purpose

Issues are what people and agents actually pick up, so their quality sets the quality of everything after. An issue that is too big, or not linked to a criterion, produces work nobody can check. This step makes every piece small, testable and traceable to why it exists.

The step is mostly mechanical once the slicing approach is chosen, so the default mode is `delegate`.

## How each mode plays out

**manual.** The team lead writes the issues from the spec, the same as today.

**assist.** A person writes the issues. The AI keeps a coverage table beside them and flags acceptance criteria no issue covers yet, issues without a success-criterion link, and anything larger than the team's size convention.

**delegate.** A person picks the slicing approach in one sentence. The AI drafts all issues, a coverage table (acceptance criterion → issue) and a suggested order. In refinement, the team edits, splits and orders them. The team decides what goes into the tracker.

## Example

Invented example, continuing frame_problem's. AC-3 and AC-4 are placeholder ids for acceptance criteria from the handoff spec.

| Title | Goal | Acceptance | Success link | Role | Size |
| --- | --- | --- | --- | --- | --- |
| Show status on a reported fault | A tenant sees received / scheduled / fixed for each report | AC-3, AC-4 | Repeat calls 40% → 15% | fe | M |
| Expose fault status from work orders | Status endpoint reads the contractor's work-order state | AC-4 | Repeat calls 40% → 15% | be | M |

## Open points

- Do issues live only in GitHub or Jira, with this artifact as a snapshot, or is this file the source until refinement is done?
- Which size scale goes into team_conventions: S/M/L, or the story points the team already uses?
