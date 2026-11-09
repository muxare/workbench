# Example project: the laundry room

> **Invented example.** Birchview Housing Cooperative, its laundry room and every person named in this folder are made up for developing and demonstrating the workbench. Nothing here describes a real client, cooperative, project or person.

A housing cooperative wants residents to book laundry-room slots and report faults on the machines. The workbench is developed and demoed on this one project, which is built to put the chain under pressure: conflicting stakeholders, a constraint found late, data nobody has, a draft that fails its checks, and every mode. Why it exists is recorded in `docs/decisions.md` (2026-11-09).

## Files

- `client_brief.md`, `business_goals.md`, `constraints.md`, `stakeholder_context.md`, `domain_rules.md`: the five external artifacts as they stood when the project started on 2026-09-01, with the front matter fields `process/artifacts.md` lists and prose below, as described in `docs/runs.md`. Proposals accepted later are told in the history, not applied to these files.
- `history.md`: how the project actually went through the chain, step by step, mistakes included. It is the answer key that runs are compared against.
- Run folders laid out as in `docs/runs.md` are not written yet.

## Cast

| Person (invented) | Role | Part in the story |
| --- | --- | --- |
| Robin Example | po, product owner | Opens `write_issues`, owns `constraints` for the team, relays questions to the caretaker |
| Sam Example | ux, designer | Runs `frame_problem`, writes the handoff spec, owns `stakeholder_context` |
| Alex Example | fe, frontend developer | Runs both `refine_ui_spec` steps, catches the privacy leak in contract review |
| Pat Example | be, backend developer | Runs both `define_api_contract` steps, knows where fault data lives |
| AI teammate | ai | Asks in assist, drafts in delegate, reviews a finished draft in manual |
| Morgan Example | stakeholder, chair of the board | Sends the brief, signs for the cooperative |
| Kim Example | stakeholder, residents' representative | Speaks for the residents; can block at the annual meeting |
| Lee Example | stakeholder, caretaker | Owns the fault records; not on the team |

The team's first names follow the existing invented seed in `apps/api/src/seed/invented.ts`.

## Where each stress point shows up

| Stress point | Where in `history.md` |
| --- | --- |
| Two stakeholders whose goals conflict (board and residents) | Step 1: the board's framing, the phone line and booking bans; resolved in the stakeholder meeting and on 2026-10-14 ("After the segment"). Set up in `business_goals.md`. |
| A constraint that surfaces in `refine_ui_spec` and calls for a `writes_back` proposal | Step 4: the privacy rule on apartment numbers, proposed to `constraints`; step 5 shows the cost of the proposal being open for three days. |
| An API that needs data the backend does not have yet: `depends_on` and waiting on another role | Step 3 (dependency known, not made into work), step 6 (`data_named`), step 7 (Needs input waiting on Robin for Lee, I-8 added, I-7 `depends_on` I-8, the AI skips I-7). |
| A draft whose success criteria have no baseline, so a structural check fails and the draft is reworked | Step 1: `criteria_measurable` fails on 2026-09-03; Lee's call tally gives 71% on 2026-09-07. |
| "Repeat calls about the same fault" from `docs/runs.md` | Step 1: the same criterion, 71% to 20% by 2027-06-30. |
| At least one step in each mode | manual: step 6; assist: steps 1, 4 and 7; delegate: steps 3 and 5. |
| Other failed checks, for variety | Step 1 `no_contradictions`; step 3 `size_within_convention` and `no_non_goal_work`. |

## Gaps the process model cannot yet express

These are recorded here and not fixed in `process/`; Phase 2 on a real project should show which of them matter. On 2026-11-09 the list was rechecked against the original wide draft of the chain in `docs/reference/team-process-map.md`. Two of the six first listed turned out not to be gaps in the model, and they are moved to the section after this one. The map does not answer any of the four that remain: `constraints`, `writes_back` and proposals were added in `process/` after the map was drafted, so the map has nothing to say about them, and it models nobody outside the team except as an external input.

- **`refine_ui_spec` cannot propose a constraint.** Its `writes_back` lists only `design_system`, and it does not read `constraints` as context, yet step 4 is exactly a constraint found during that step. The map does not help here. Its `refine_ui_spec(Issues, UI spec, Acceptance criteria) -> Refined UI spec, Open questions` has no `constraints` at all, and its only way to send something back is open questions to design. A privacy rule is not a design question, so following the map would send it to the wrong owner.
- **Waiting on someone outside the team.** A card in Needs input must wait on a teammate, so a question for the caretaker has to wait on the product owner who passes it on. `contract_questions.asked_of` can name the caretaker, but the board cannot. The map treats everything from outside the team as an input artifact marked `*`, such as `Domain rules*` and `Participants*`, never as a person someone waits on. One possible shape is therefore a card waiting on an external artifact, here the caretaker's fault records as a source in `domain_rules`, rather than on a person. That is still something the model cannot express today.
- **Open proposals are invisible to later steps.** Nothing tells a step that reads `constraints` that a proposal against it is pending, which is how step 5 drafted against the old rule. The map has no proposals, so this gap belongs entirely to the `writes_back` mechanism in `process/template.md` and `docs/runs.md`.
- **Whose goal is it?** `business_goals` has no field for which stakeholder holds a goal, so a conflict between goals lives only in prose and in `stakeholder_context`. The map marks `Business goals*` as coming from outside the team and asks only that "stakeholders agree on the problem and how success is measured", which assumes several stakeholders without saying which goal is whose.

## Missing from the example, not from the model

These two were first listed as gaps. The recheck on 2026-11-09 showed that `process/` already covers both, and the fix belongs in the example or in a later segment.

- **No `domain_rules` file in the example.** `process/artifacts.md` already defines `domain_rules` as an external artifact owned by stakeholders, with the fields `rule`, `example` and `source`, and the map marks `Domain rules*` as an input from outside the team to both `define_api_contract` and `design_architecture`. The example lacked its own file, so the rules `define_api_contract` needs appeared only in Pat's first move in step 5 of `history.md`. Fixed on 2026-11-09: `domain_rules.md` now holds the three rules (at most two future bookings per resident, opening hours set by the board, the caretaker's fault records as the source of fault status). It was a data change, not a template change.
- **`write_handoff_spec` has no function file yet.** The map defines it: `write_handoff_spec(Prototype, Design critique, Success criteria, Open questions) -> UI spec, Acceptance criteria`, with AI drafting and the designer verifying, done when every state and edge case has a testable criterion. It is outside the phase 1 segment by design, and `process/artifacts.md` already says its outputs are supplied by hand in the first run, which is what step 2 does. This is the edge of the segment, not something the model cannot express. The map does show one link worth keeping in mind for when the function is written: it takes the open questions that `refine_ui_spec` sends back, which in `process/` are `design_questions`.
