---
template: 1
name: frame_problem
role: ux
title: Frame the problem and success criteria
summary: Turns a client's request into a problem worth solving, how success is measured, and what must be tested before building.
inputs:
  - artifact: client_brief
    required: true
    from: external
  - artifact: business_goals
    required: true
    from: external
  - artifact: launch_insights
    required: false
    from: analyze_launch
context:
  - artifact: constraints
    from: external
  - artifact: stakeholder_context
    from: external
tacit:
  - Who actually decides, and who only signs.
  - What is politically sensitive or has failed before.
  - What the client said in meetings but did not write in the brief.
  - Which deadline or budget is fixed and which is negotiable.
outputs:
  - artifact: problem_statement
  - artifact: success_criteria
  - artifact: assumptions
  - artifact: non_goals
  - artifact: client_questions
checks:
  structural:
    - id: fields_filled
      rule: Every output file's front matter has all fields listed for it in artifacts.md.
    - id: criteria_measurable
      rule: Every success criterion has a number in baseline and target, and a date in deadline.
    - id: no_solution_words
      rule: The problem statement contains none of the listed solution words (app, portal, dashboard, feature, button, integration).
      severity: warning
    - id: assumptions_have_status
      rule: Every assumption is marked tested or untested, and every untested one has a risk_if_wrong.
    - id: at_least_one_non_goal
      rule: There is at least one non-goal.
  consistency:
    - id: problem_traces_to_brief
      rule: The problem statement can be traced to something in the client brief, or the difference is explained.
    - id: criteria_trace_to_goals
      rule: Every success criterion serves at least one business goal.
    - id: no_contradictions
      rule: No non-goal contradicts the brief without a client question about it.
    - id: problem_not_a_solution
      rule: The problem statement describes a need, not a solution, whatever words it uses.
    - id: assumptions_cover_risks
      rule: Every claim the problem statement depends on appears as an assumption.
  human:
    approver: designer
    where: in the tool, then with stakeholders in a meeting
    criteria: The designer approves the framing; stakeholders agree on the problem and on how success is measured.
modes:
  default: assist
  allowed: [manual, assist, delegate]
protocols:
  manual:
    opens: human
    asks: none
    writes: human
    decides: human
    note: The AI may review the finished draft against the checks if asked.
  assist:
    opens: human
    asks: ai
    writes: human
    decides: human
    note: The AI asks about gaps and challenges vague words while the designer writes.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The designer writes a one-sentence hunch first. The AI drafts two or three framings and lists what it guessed. The designer corrects, chooses and edits.
decision_log:
  - Questions the AI asked and the designer's answers.
  - The framings considered and which one was chosen, and why.
  - Changes the stakeholders asked for in the meeting.
writes_back:
  - artifact: stakeholder_context
    what: Who decides, sensitivities and history that came up in the conversation.
  - artifact: constraints
    what: Deadlines or budgets confirmed as fixed or negotiable.
---

## Purpose

Most rework starts with a solution accepted as a problem. A brief often asks for a thing ("we need an app"). This step finds the need behind it, says how anyone will know it was met, and lists what the team is only assuming. Without it, every later step builds confidently on a guess.

The step is mostly judgment, so the default mode is `assist`: the designer writes, the AI asks.

## How each mode plays out

**manual.** The designer reads the brief and goals and writes all five outputs. When done, they can ask the AI to run the structural and consistency checks. No conversation during the writing.

**assist.** The designer writes, and the AI acts as a critical colleague. It asks who exactly the user is, points at criteria without a number, and notes where the draft drifts from the brief. It also asks for the tacit knowledge listed above. It never writes the outputs itself.

**delegate.** The designer starts with one sentence: their hunch about the real problem. The AI reads the inputs and drafts two or three different framings, each with criteria and assumptions, plus a list of what it had to guess. The designer answers the guesses, picks a framing and edits it. The choice between framings is the judgment the designer keeps.

In all modes the designer decides, and the tacit knowledge that came up is written back to `stakeholder_context` and `constraints` after the step.

## Example

Invented example, for illustration only.

Brief: "Our tenants need an app to report faults in their apartments."

- **Problem statement.** Tenants in our 1,200 apartments cannot tell whether a reported fault has been received or when it will be fixed. They phone the service desk again, which takes staff time and lowers tenant trust. Why now: the service desk is being cut from five to three people in March.
- **Success criteria.**

  | Metric | Baseline | Target | Deadline | Method |
  | --- | --- | --- | --- | --- |
  | Repeat calls about the same fault | 40% of fault calls | 15% | 2027-06-30 | Service desk call log |
  | Tenant satisfaction with fault handling | 3.1 of 5 | 4.0 of 5 | 2027-09-30 | Yearly tenant survey |

- **Assumptions.** "Tenants call again because they lack status, not because faults take long to fix": untested, risk if wrong: the solution adds status updates nobody needs.
- **Non-goals.** Changing how quickly faults are repaired (owned by the maintenance contractor).
- **Client questions.** Can we read the maintenance contractor's work-order status? It decides whether status can be automatic.

## Open points

- Should `success_criteria` allow qualitative criteria, or must every criterion be a number?
- Who maintains `stakeholder_context` between projects?
- Is "meeting" a good enough record for the human check, or should stakeholder sign-off be recorded in the tool?
