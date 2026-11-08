---
template: 1
name: refine_ui_spec
role: fe
title: Turn the issue into a buildable UI spec
summary: Settles every screen, state and piece of data the frontend needs before building, and sends what is unclear back to design.
inputs:
  - artifact: issues
    required: true
    from: write_issues
  - artifact: ui_spec
    required: true
    from: write_handoff_spec
  - artifact: acceptance_criteria
    required: true
    from: write_handoff_spec
context:
  - artifact: design_system
    from: maintain_design_system
  - artifact: codebase
    from: external
tacit:
  - Which existing components the developer trusts and which they avoid.
  - What the designer meant but did not draw, from earlier conversations.
  - Performance or device limits the team knows from experience.
outputs:
  - artifact: refined_ui_spec
  - artifact: design_questions
checks:
  structural:
    - id: fields_filled
      rule: Every output file's front matter has all fields listed for it in artifacts.md.
    - id: states_complete
      rule: Every screen lists loading, empty, error and success states, or says why one does not apply.
    - id: data_named
      rule: Every piece of data shown on a screen is named in data_needed, with its source.
  consistency:
    - id: acceptance_covered
      rule: Every acceptance criterion linked from the issue is met by a screen or state in the refined spec.
    - id: design_system_used
      rule: Components named in the spec exist in the design system, or a design question asks for a new one.
    - id: no_silent_change
      rule: Any difference from the UI spec is listed under decisions or raised as a design question.
  human:
    approver: frontend developer, with the designer for open questions
    where: in the tool; open design questions in a short call
    criteria: No design question blocks the build, and the developer could start without asking where a value comes from.
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
    note: The AI reads the issue, spec and design system and lists missing states, unnamed data and components that do not exist.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The developer names the screens in scope. The AI drafts the refined spec and the design questions; the developer edits and the designer answers the questions.
decision_log:
  - Design questions asked and the designer's answers.
  - Deviations from the UI spec and who agreed to them.
writes_back:
  - artifact: design_system
    what: Components or states the design system lacks, as a proposal for the UX owner to accept or reject.
---

## Purpose

Frontend work stalls on two things: a state nobody designed, and data nobody said where to get. This step finds both before building starts. What the developer cannot settle alone goes back to design as explicit questions, instead of being guessed in code.

It is the frontend developer's craft step for understanding the work, so the default is `assist`: the developer works through the spec, the AI makes sure nothing is missed.

## How each mode plays out

**manual.** The developer reads the issue and design and writes down what they need, as today.

**assist.** The developer works through the screens. The AI keeps a checklist beside them: missing states, data without a source, components the design system lacks, acceptance criteria not yet met. Its questions become design questions when the developer agrees.

**delegate.** The developer lists the screens in scope. The AI drafts the refined spec and the design questions from the issue, the UI spec and the design system. The developer edits, and the designer answers the questions.

## Example

Invented example, continuing write_issues'.

- **Screen:** Fault detail. **States:** loading; error (status unavailable, show the date reported and the service desk number); success (received / scheduled / fixed, with the date of each). Empty does not apply: the screen opens from an existing report.
- **Data needed:** fault id, reported date, current status, status dates. Source: new status endpoint (see define_api_contract).
- **Design question:** What does a tenant see when the contractor has scheduled a visit but not a time? Blocks: the scheduled state.

## Open points

- Is `refined_ui_spec` a new document per issue, or an annotated copy of the UI spec?
- Should design questions go to the designer through the tool, or through the team's chat?
