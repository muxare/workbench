# History: how the laundry room project went

> **Invented example.** This history, Birchview Housing Cooperative and every person in it are made up for developing and demonstrating the workbench. Nothing here describes a real client, project or person.

This is the answer key. It tells how the project actually went through the chain, step by step, mistakes included, from the brief on 2026-09-01 to a signed fault-status contract on 2026-10-12. A run of the workbench on the same inputs is compared with it: did the run ask what was asked here, catch what was caught here, and avoid what went wrong here? Each step ends with **A run should**, the points to compare against.

The team is Robin (po), Sam (ux), Alex (fe), Pat (be) and the AI teammate; the stakeholders are Morgan (board chair), Kim (residents' representative) and Lee (caretaker). All names are invented; the cast is in `README.md`. Issue ids `I-1` to `I-8` are invented too.

## Step 1. frame_problem: Sam (ux), assist, 2026-09-02 to 2026-09-10

**Asked.** Sam opened the step with the brief, the business goals, the constraints and the stakeholder context, and wrote the draft while the AI asked. Sam's first problem statement was the board's: "Booked slots go unused and the caretaker is flooded with calls." The AI asked whose problem that was, and pointed out that the third business goal (residents can wash when they need to) had no line in the problem at all. It then asked for the tacit items: who actually decides, what failed before, and whether the 2027-03-01 deadline was fixed.

**What Sam answered.** Morgan signs, but Kim's laundry group can block anything at the annual meeting, as it blocked a coin-operated booking panel in 2019. The board wants fault reports through the service only and, said in the kick-off but not written in the brief, a two-week booking ban after three unused slots; Kim opposes both. The deadline is fixed in Morgan's eyes but the meeting date could move a week.

**What went wrong: no baseline.** Sam's first draft of `success_criteria` had "Repeat calls about the same machine fault: baseline unknown, target 20%". The structural check `criteria_measurable` failed on 2026-09-03, because the baseline had no number, and the draft could not go to the critic or to Sam's approval. Sam asked Lee to tally his call notebook for 2026-08-03 to 2026-08-30. Lee sent it on 2026-09-07: 31 fault calls about 9 faults, 22 of them about a fault already reported, so 71%. The reworked draft passed on 2026-09-07. This is the "repeat calls about the same fault" criterion from `docs/runs.md`, here with a baseline that had to be fetched rather than one that was at hand.

**Consistency.** The critic flagged `no_contradictions`: the non-goal "Closing the phone line" contradicts the brief's "fault reports through the new service only". Sam kept the non-goal and added a client question, so the check passed.

**Decided.** The final outputs on 2026-09-07:

- Problem statement: Residents cannot see whether a machine is working or a fault is already reported, so they phone the caretaker again and again, and slots go unused when a resident finds the machine broken or cannot come. Why now: the caretaker's hours drop from 20 to 16 a week on 2027-01-01 (invented).
- Success criteria: repeat calls about the same machine fault, 71% to 20%; caretaker hours on the laundry room, 6 a week (Lee's estimate, August 2026) to 2; unused booked slots, 18% (two-week door-list count by Kim, 2026-09) to 8%; residents who can usually get a slot within two days, 61% (residents' survey, 2026-05) to 80%. All by 2027-06-30.
- Assumptions: residents call again because they cannot see the fault is known, not because repairs are slow (untested; if wrong, a status display changes nothing). Most unused slots come from broken machines and forgetting, not from hoarding (untested; if wrong, the board's ban is the right tool).
- Non-goals: closing the phone line (older residents depend on it); booking bans (contested between board and residents; see client question).
- Client questions: Will the board accept that phone reports stay, with the caretaker entering them? Will the board decide on booking bans before the build starts? Both block the scope of issues.

**Approval.** Sam approved the framing in the tool on 2026-09-08. In the stakeholder meeting on 2026-09-10, Morgan accepted that the phone line stays if Lee enters phone reports himself, and moved the ban question to the board meeting on 2026-10-14. Kim agreed to the criteria. Recorded as approved with changes.

**Writes back.** Two proposals. To `stakeholder_context` (owner ux): Kim's group can block at the annual meeting; the 2019 panel failed there; the board and residents disagree on bans and on the phone line. Sam accepted it on 2026-09-10. To `constraints` (owner team): the 2027-03-01 date is fixed for a demonstration, not for the full service. Robin accepted it on 2026-09-11.

**A run should** ask whose problem the first framing describes and bring the residents' goal in, which since 2026-11-12 the consistency check `every_holder_heard` asks for, reading `held_by` in `business_goals`; ask for who can block, not only who signs; fail `criteria_measurable` on a missing baseline and send the draft back rather than let the AI invent a number; and raise the phone-line contradiction as a client question.

## Step 2. write_handoff_spec, outside the segment: Sam (ux), by hand, 2026-09-11 to 2026-09-15

This step has no function file yet; `process/artifacts.md` says its outputs are supplied by hand in the first run. Sam wrote `ui_spec` (screens: Book a slot, My bookings, Report a fault, Machine status) and `acceptance_criteria` AC-1 to AC-9. One detail matters later: the Book a slot screen showed taken slots with the apartment number of the resident who held them, "so neighbours can swap". Nobody questioned it here.

**A run should** take `ui_spec` and `acceptance_criteria` as given inputs, not generate them.

## Step 3. write_issues: Robin (po) with the team, delegate, 2026-09-16 to 2026-09-17

**Asked.** Robin made the first move: "Slice by resident flow: book, report a fault, see machine status. The caretaker's side is out of this round." The AI drafted seven issues, a coverage table from AC-1 to AC-9, and a suggested order.

**What went wrong: too big.** The AI drafted "Booking calendar with week view, rebooking and reminders" as size L. The structural check `size_within_convention` failed, because `team_conventions` allows at most M. The AI split it into I-1 Book a slot (M), I-2 See and cancel my bookings (S) and I-3 Booking reminders (S).

**What went wrong: non-goal work.** The AI drafted "Send a booking-ban notice after three unused slots". The critic's `no_non_goal_work` flagged it against the non-goal on booking bans, and Robin dropped it.

**Refinement, 2026-09-17.** Pat said what the AI could not have read anywhere: fault status lives in Lee's notebook and a spreadsheet on his own laptop, and no system holds it. The final issues were I-1 to I-3 (fe), I-4 Report a fault on a machine (fe, M), I-5 See machine status and fault progress (fe, M), I-6 Agree the booking API contract (be, M) and I-7 Agree the fault-status API contract (be, M). The team approved the list and order.

**Writes back.** A proposal to `constraints`: "Fault status depends on the caretaker's records, which no system holds." Robin accepted it on 2026-09-17.

**What went wrong: a dependency written down but not made into work.** The team recorded the dependency as a constraint but made no issue for getting the caretaker's records into a readable form, and gave I-7 no `depends_on`. It cost twelve days in step 7.

**A run should** fail the L issue and split it; flag the ban notice as non-goal work; ask about dependencies on other systems or people (a tacit item of this function) and, when told, propose an issue for the dependency and a `depends_on` link, not only a constraint.

## Step 4. refine_ui_spec for I-1 and I-2: Alex (fe), assist, 2026-09-21 to 2026-09-24

**Asked.** Alex worked through Book a slot and My bookings while the AI kept the checklist. It found the empty state of My bookings missing, and it asked where "apartment number of the holder" in `data_needed` came from and who was allowed to see it. The second half was tacit; the AI could not answer it from the files.

**The constraint that surfaced.** Alex asked Robin, who remembered that the cooperative's privacy rule, adopted by the board in 2025 (invented), forbids showing one resident's name or apartment number to other residents in any digital service. It was not in `constraints`. The UI spec broke it.

**Decided.** Taken slots show only "Booked"; a resident sees which slots are their own. Alex logged the change from the UI spec under `decisions`, as `no_silent_change` requires, and sent a design question to Sam: how do neighbours swap slots without seeing who holds them? It does not block the build; swapping was left out. Sam answered on 2026-09-23: not in this version.

**Writes back.** A proposal to `constraints` (owner team): add to `regulation` that no other resident's name or apartment number is shown in any view. Robin accepted it on 2026-09-24, three days after it was written.

**A run should** ask who may see the holder's apartment number instead of only naming its source; record the deviation from the UI spec and raise a design question; and write the constraint as a proposal to `constraints`. Since 2026-11-12 `refine_ui_spec` reads `constraints` as context and lists it in `writes_back`, so the function file has a place for this proposal; before that it had none (see `README.md`, closed gaps).

## Step 5. define_api_contract for I-6, booking: Pat (be), delegate, 2026-09-22 to 2026-09-24

**Asked.** Pat made the first move: "Slots are computed from opening hours per machine group, not stored; a booking holds one slot, and a resident holds at most two future bookings." Because the slot model is a judgment call, the AI offered two alternatives: slots computed on request, or pre-generated slot rows for twelve weeks. Pat chose computed, because opening hours change when the board says so. The AI drafted the OpenAPI file with examples and two contract questions.

**What went wrong: drafted against the old constraints.** The privacy proposal from step 4 was still open, so the `constraints` the AI read did not contain it, and the AI followed the UI spec: each taken slot in `GET /slots` carried `bookedBy: { apartment: "1203" }`. No check caught it; the structural checks only read shape, and `rules_respected` reads `domain_rules`. Alex caught it in the contract review on 2026-09-23 and the review sent the draft back. The fix replaced `bookedBy` with `mine: true | false`.

**Decided.** Both developers signed off on 2026-09-24, after Robin accepted the privacy proposal. The rule "at most two future bookings" is answered with 409 and a reason. Booking bans are not in the contract, pending the board.

**A run should** offer two or three slot models, since the step is a judgment call in delegate mode; and read the open privacy proposal beside `constraints`, as `docs/runs.md` has required since 2026-11-12, so the draft leaves out `bookedBy` or the decision log tells Pat that it contradicts a pending proposal. A run that serves `bookedBy` without a word has made the same mistake the team made.

## Step 6. refine_ui_spec for I-4 and I-5, faults: Alex (fe), manual, 2026-09-25 to 2026-09-28

**Asked.** Nothing during the writing. Alex knew these screens and wrote the refined spec alone, then asked the AI to run the checks on the finished draft, which the manual protocol allows.

**What went wrong: data without a source.** The structural check `data_named` failed: "fault progress (reported, repair booked, fixed)" on Machine status had no source. Alex named it honestly: "the caretaker's fault records; no system holds them yet (see constraints)". The check passed. Alex also asked Sam how a fault reported by phone shows up; Sam answered on 2026-09-28 that it looks the same once Lee has entered it, without the reporter's name.

**Decided.** Approved by Alex on 2026-09-28, with no design question blocking the build.

**A run should** fail `data_named` on fault progress and accept a source that says plainly the data does not exist yet, so the gap is handed to the backend instead of hidden.

## Step 7. define_api_contract for I-7, fault status: Pat (be), assist, 2026-09-29 to 2026-10-12

**Asked.** Pat picked I-7 on 2026-09-29 and wrote; the AI compared the draft with the refined spec. Its first remark was that `data_needed` names a source no system holds, and that `constraints` says so too. It asked which source the endpoint reads, and whether the caretaker could give the format of his records. Pat could not answer that; only Lee could.

**Waiting on another role.** The contract question went to Lee, asked through Robin, because Lee is not on the team. I-7 moved to Needs input, waiting on the caretaker's fault records in `domain_rules`, relayed by Robin. The team now did what it should have done in step 3: it added I-8 "Get the caretaker's fault records into a form the API can read" (po with the caretaker, S) and set I-7 `depends_on` I-8.

**The answer.** Lee replied through Robin on 2026-10-07: the spreadsheet has machine, date, what is wrong and the repair firm's visit date, but he forgets to update it. He agreed to log every fault, including phone reports, in a short shared form from 2026-10-12, and the old notebook history would not be moved. Robin recorded the answer, which returned I-7 to In progress. The form did not exist yet, so Pat moved I-7 back to Ready. On 2026-10-08 the AI teammate looked for a Ready card in assist and skipped I-7, because its dependency I-8 was unfinished. I-8 was done on 2026-10-09, when the form was set up and Lee had tried it, and Pat picked I-7 again that day.

**Decided.** `GET /machines` with each machine's state and open fault, and `GET /faults/{faultId}` with progress dates. Faults reported before 2026-10-12 are not served. A 503 with a readable reason covers the form's store being unreachable. Both developers signed off on 2026-10-12.

**Writes back.** A proposal to `constraints`: the caretaker owns the fault records; the API reads them and never edits them. Robin accepted it on 2026-10-12.

**What went wrong.** Twelve days passed between the step 3 refinement, where the dependency was known, and 2026-09-29, when it became a card, and eight more waiting on Lee. Asking Lee on 2026-09-17 would have saved most of both.

**A run should** ask about the missing source at once; route the question to a person on the team when the one who knows is outside it; propose an issue for the dependency and a `depends_on` link; and keep the AI from picking I-7 while I-8 is open.

## After the segment

The board decided on 2026-10-14 that there are no booking bans in the first version, and that it will look again after six months of data on unused slots. Sam closed the client question and Robin recorded the decision. The build started on 2026-10-19.
