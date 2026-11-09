# Team process map (reference)

> **Reference only.** This is the original wide draft of the chain, copied from the Team Process Map artifact (https://claude.ai/artifact/XcK8U1F2A9dM4ub1KLq2fA) on 2026-11-09 with the suggested modes. `process/` is the source of truth: where the two disagree, `process/` wins. Do not create function files from this list; add a function to `process/` only when a task asks for it.

Team process map: chain of functions
Format: function(inputs) -> outputs | who does it | done when
Inputs marked * come from outside the team.

## UX and product design
frame_problem(Client brief*, Business goals*, Launch insights) -> Problem statement, Success criteria
    I do it | done when: Stakeholders agree on the problem and how success is measured.
plan_research(Problem statement) -> Research plan, Interview guide
    AI assists, I drive | done when: Questions are neutral and each maps to an open assumption.
run_sessions(Research plan, Interview guide, Participants*, Prototype) -> Session notes, Recordings
    I do it | done when: Every session has notes and a recording.
synthesize_research(Session notes, Recordings) -> Research themes
    AI does it, I verify | done when: Each theme cites raw quotes and how many people said it.
map_flows(Problem statement, Research themes) -> User flows, Information architecture
    AI assists, I drive | done when: Every success criterion has a flow that serves it.
explore_variants(User flows, Design system) -> Design variants
    AI does it, I verify | done when: Variants differ in direction, not only in style.
build_prototype(Design variants, User flows, Information architecture, Design system) -> Prototype
    AI does it, I verify | done when: The main flows are clickable end to end.
critique_design(Prototype, Design system) -> Design critique
    AI assists, I drive | done when: Contrast and states pass; open issues are listed.
maintain_design_system(Design critique, UI components) -> Design system
    AI assists, I drive | done when: Tokens in the design tool and in code match.
write_handoff_spec(Prototype, Design critique, Success criteria, Open questions) -> UI spec, Acceptance criteria
    AI does it, I verify | done when: Every state and edge case has a testable criterion.
review_built_ui(Preview build, UI spec) -> Design review notes
    AI assists, I drive | done when: Each drift is either fixed or accepted on purpose.
analyze_launch(Usage analytics*, Production metrics) -> Launch insights
    AI does it, I verify | done when: Insights point to a decision, not only to numbers.

## Frontend
refine_ui_spec(Issues, UI spec, Acceptance criteria) -> Refined UI spec, Open questions
    AI assists, I drive | done when: No open question blocks the build.
plan_components(Refined UI spec, Design system, Codebase*) -> Component plan
    I do it | done when: Each piece of state has one owner.
pull_design_context(Design handoff package, Prototype) -> Design context
    AI does it, I verify | done when: Layout and tokens come from the design system, not guesses.
scaffold_components(Component plan, Design context, API client) -> UI components
    AI does it, I verify | done when: It builds, types check and stories render.
implement_interactions(UI components, Refined UI spec, API mocks) -> Working UI
    AI assists, I drive | done when: Every state in the spec works, including errors.
style_layout(Working UI, Design context) -> Styled UI
    AI does it, I verify | done when: Matches the design at each breakpoint and theme.
accessibility_pass(Styled UI) -> Accessibility report
    AI assists, I drive | done when: Keyboard and screen reader paths work.
write_frontend_tests(Styled UI, Acceptance criteria) -> Frontend tests
    AI does it, I verify | done when: Each acceptance criterion has a test that fails without the feature.
tune_performance(Styled UI, Performance budget*) -> Performance report
    AI assists, I drive | done when: Within budget on a mid-range phone.
open_pull_request(Styled UI, Frontend tests, Accessibility report) -> Pull request, Preview build
    AI does it, I verify | done when: The PR shows screenshots and tests pass.
review_frontend_pr(Pull request, Design review notes, Performance report, Approval rules) -> Approved change
    AI assists, I drive | done when: A named person approved; risky parts were read line by line.
fix_bug(Bug report, Codebase*) -> Pull request
    AI does it, I verify | done when: The bug reproduces before the fix and not after, with a test.
upgrade_dependencies(Codebase*, Dependency release notes*) -> Pull request
    AI does it, I verify | done when: Tests pass and behavior is unchanged.

## Backend
define_api_contract(Refined UI spec, Domain rules*) -> API contract
    AI assists, I drive | done when: Frontend and backend both sign off.
design_architecture(API contract, Domain rules*, Non-functional requirements*) -> Architecture decision, Data model
    I do it | done when: The decision record states the options and why one won.
write_spec_and_tasks(API contract, Data model, Architecture decision) -> Backend spec, Tasks
    AI assists, I drive | done when: Each task is small and has an acceptance test.
implement_services(Tasks, Backend spec, API contract) -> Service code
    AI does it, I verify | done when: Contract tests pass.
write_migration(Data model) -> Migration script, Rollback plan
    AI assists, I drive | done when: Rehearsed on a copy of production data.
wire_integrations(Backend spec, External API docs*) -> Integration code
    AI does it, I verify | done when: Retries and timeouts are tested; no secrets in code.
write_backend_tests(Service code, API contract, Contract tests) -> Backend tests
    AI does it, I verify | done when: Assertions cover errors and limits, not only happy paths.
review_security(Service code, Data model, API contract) -> Threat model, Security findings
    I do it | done when: Every finding is fixed or accepted by a named owner.
review_backend_pr(Service code, Integration code, Backend tests, Threat model, Security findings, Approval rules) -> Approved change
    AI assists, I drive | done when: A named person approved; data, auth and money diffs were read.
build_pipeline(Architecture decision, Approved change) -> Pipeline, Environments
    AI assists, I drive | done when: A change reaches staging with no manual step.
deploy(Approved change, Pipeline, Environments, Migration script, Rollback plan, Approval rules) -> Release
    I do it | done when: Health checks are green and rollback has been tested.
observe_and_tune(Release, Telemetry*) -> Dashboards and alerts, Production metrics
    AI assists, I drive | done when: Every alert has an owner and a runbook.
debug_failure(Dashboards and alerts, Logs and traces*) -> Root cause, Bug report
    AI does it, I verify | done when: The cause is confirmed by reproducing it.
respond_to_incident(Dashboards and alerts, Root cause, Runbooks) -> Incident timeline, Status updates, Postmortem
    I do it | done when: Users are informed and follow-ups have owners.
write_docs(Service code, Postmortem, Architecture decision) -> Runbooks, Docs
    AI does it, I verify | done when: A new teammate can run the service from the docs alone.

## Between roles
hand_off_design(UI spec, Design system, Prototype) -> Design handoff package
    AI assists, I drive | done when: Frontend can build without asking where a value comes from.
agree_contract(API contract, Refined UI spec) -> API mocks, API client, Contract tests
    AI assists, I drive | done when: Both sides build against the same file and mocks.
write_issues(Problem statement, Success criteria, Acceptance criteria) -> Issues
    AI does it, I verify | done when: Each issue is small, testable and links to its criteria.
define_quality_gates(Team agreements*) -> Approval rules
    I do it | done when: Every change type has a named approver.
plan_learning(Team skills*, Postmortem) -> Learning plan
    I do it | done when: Each junior has weekly explain-first and review time.
