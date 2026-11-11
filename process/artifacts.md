---
template: 1
artifacts:
  # From outside the team
  - id: client_brief
    name: Client brief
    owner: stakeholders
    made_by: external
    format: markdown
    fields: [request, background, deadline, contact]
  - id: business_goals
    name: Business goals
    owner: stakeholders
    made_by: external
    format: markdown
    fields: [goal, metric, horizon]
  - id: domain_rules
    name: Domain rules
    owner: stakeholders
    made_by: external
    format: markdown
    fields: [rule, example, source]

  # Standing context, read but not changed by the steps that use it
  - id: constraints
    name: Constraints
    owner: team
    made_by: external
    format: markdown
    fields: [time, budget, technology, regulation, team_conventions]
    note: team_conventions holds habits such as the issue size scale and the largest size allowed.
  - id: stakeholder_context
    name: Stakeholder context
    owner: ux
    made_by: external
    format: markdown
    fields: [who_decides, who_is_affected, sensitivities, history]
    note: Grows over time from what frame_problem's conversations reveal (writes_back).
  - id: design_system
    name: Design system
    owner: ux
    made_by: maintain_design_system
    format: tokens and components
    fields: [tokens, components, usage_rules]
  - id: codebase
    name: Codebase
    owner: team
    made_by: external
    format: repository
    fields: [modules, conventions, existing_apis]

  # Made inside the segment
  - id: problem_statement
    name: Problem statement
    owner: ux
    made_by: frame_problem
    format: markdown
    fields: [who, situation, need, why_now]
  - id: success_criteria
    name: Success criteria
    owner: ux
    made_by: frame_problem
    format: markdown table
    fields: [metric, baseline, target, deadline, method]
  - id: assumptions
    name: Assumptions to test
    owner: ux
    made_by: frame_problem
    format: markdown table
    fields: [claim, evidence, status, risk_if_wrong]
    note: status is tested or untested. Feeds plan_research.
  - id: non_goals
    name: Non-goals
    owner: ux
    made_by: frame_problem
    format: markdown list
    fields: [item, reason]
  - id: client_questions
    name: Open questions for the client
    owner: ux
    made_by: frame_problem
    format: markdown list
    fields: [question, why_it_matters, blocks]
  - id: issues
    name: Issues
    owner: team
    made_by: write_issues
    format: issue tracker items
    fields: [title, goal, acceptance_criteria, success_criteria_link, role, size]
  - id: refined_ui_spec
    name: Refined UI spec
    owner: fe
    made_by: refine_ui_spec
    format: markdown
    fields: [screens, states, data_needed, edge_cases, decisions]
  - id: design_questions
    name: Open questions for design
    owner: fe
    made_by: refine_ui_spec
    format: markdown list
    fields: [question, screen_or_state, blocks]
  - id: api_contract
    name: API contract
    owner: be
    made_by: define_api_contract
    format: OpenAPI 3.1 YAML
    fields: [endpoints, schemas, errors, auth, limits]
  - id: contract_questions
    name: Open questions about the contract
    owner: be
    made_by: define_api_contract
    format: markdown list
    fields: [question, endpoint, asked_of]

  # Made by steps outside the segment; supplied by hand in the first run
  - id: launch_insights
    name: Launch insights
    owner: ux
    made_by: analyze_launch
    format: markdown
    fields: [observation, evidence, suggested_decision]
  - id: ui_spec
    name: UI spec
    owner: ux
    made_by: write_handoff_spec
    format: markdown
    fields: [screens, states, behavior, edge_cases]
  - id: acceptance_criteria
    name: Acceptance criteria
    owner: ux
    made_by: write_handoff_spec
    format: markdown list
    fields: [given, when, then]

  # The coding functions the development loop needs (docs/dev-loop.md)
  - id: tasks
    name: Backend tasks
    owner: be
    made_by: write_spec_and_tasks
    format: markdown list
    fields: [title, acceptance_test, size, depends_on]
    note: Supplied by hand until write_spec_and_tasks is drafted; on a board, a card's description can stand in for one task.
  - id: backend_spec
    name: Backend spec
    owner: be
    made_by: write_spec_and_tasks
    format: markdown
    fields: [scope, behavior, data_changes, errors]
  - id: ui_components
    name: UI components
    owner: fe
    made_by: scaffold_components
    format: code in the repository
    fields: [components, props, stories]
  - id: api_mocks
    name: API mocks
    owner: team
    made_by: agree_contract
    format: code in the repository
    fields: [endpoints, examples]
  - id: bug_report
    name: Bug report
    owner: team
    made_by: debug_failure
    format: markdown
    fields: [observed, expected, steps_to_reproduce, where, severity]
    note: Supplied by hand until debug_failure is drafted; a person who finds a bug writes one directly.
  - id: service_code
    name: Service code
    owner: be
    made_by: implement_services
    format: commits on a branch
    fields: [branch, card, summary, tests]
  - id: working_ui
    name: Working UI
    owner: fe
    made_by: implement_interactions
    format: commits on a branch
    fields: [branch, card, screens, states, tests]
  - id: bug_fix
    name: Bug fix
    owner: team
    made_by: fix_bug
    format: commits on a branch
    fields: [branch, card, cause, reproduction_test, summary]
  - id: pull_request
    name: Pull request
    owner: team
    made_by: open_pull_request
    format: pull request on the code host
    fields: [title, card, branch, summary, how_tested, risks]
  - id: approved_change
    name: Approved change
    owner: team
    made_by: review_pull_request
    format: approved pull request
    fields: [pull_request, approver, findings, resolution]
    note: findings are the AI critic's and the reviewer's comments; resolution says for each whether it was fixed or accepted on purpose.
---

# Artifact list

Every artifact a function reads or writes is defined here once: its id, who owns it, which function makes it, its format and its required fields. Function files refer to artifacts by `id` only.

This first version covers the phase 1 segment: frame_problem → write_issues → refine_ui_spec → define_api_contract. Artifacts made by steps outside the segment (`launch_insights`, `ui_spec`, `acceptance_criteria`) are supplied by hand during the first run.

## How to read it

- `made_by: external` means the artifact comes from outside the team's chain, or is standing context nobody in the chain produces.
- `fields` are the required fields. The structural check of the function that makes the artifact verifies them.
- An artifact made in one role and used in another is a **handoff**. In this segment: `problem_statement`, `success_criteria` (ux → team), `issues` (team → fe), `refined_ui_spec` (fe → be), `design_questions` (fe → ux).
- The coding functions added on 2026-11-11 (`implement_services`, `implement_interactions`, `fix_bug`, `open_pull_request`, `review_pull_request`) hand code to each other as commits on a branch: `service_code`, `working_ui` and `bug_fix` go into `open_pull_request`, and its `pull_request` goes into `review_pull_request`. Their inputs from steps not yet drafted (`tasks`, `backend_spec`, `ui_components`, `api_mocks`, `bug_report`) are supplied by hand, like `ui_spec`.

## Artifact files

During a run, each artifact is a markdown file whose YAML front matter holds its fields, with free prose below for people. Fields that are tables (such as `success_criteria`) are lists of objects. Structural checks read only the front matter. See `docs/runs.md`.

## Adding an artifact

Add an entry above, then run `pnpm validate`. The validator fails if a function refers to an id that is not here, or if `made_by` names a function whose outputs do not include the artifact.
