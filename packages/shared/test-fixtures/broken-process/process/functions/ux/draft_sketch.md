---
# Invented fixture: mostly valid, with broken artifact references.
template: 1
name: draft_sketch
role: ux
title: Draft a sketch
summary: Invented step that turns a brief into a sketch.
inputs:
  - artifact: brief
    required: true
    from: external
  # No 'required'
  - artifact: sketch
    from: draft_sketch
  # 'from' does not match made_by
  - artifact: plan
    required: false
    from: external
  # Unknown artifact
  - artifact: moodboard
    required: false
    from: external
context:
  - artifact: style_guide
    from: refine_ui_spec
  - artifact: palette
    from: external
outputs:
  - artifact: sketch
  - artifact: plan
  - artifact: storyboard
checks:
  structural:
    - id: has_frames
      rule: The sketch has at least one frame.
  consistency:
    - id: traces_to_brief
      rule: Every frame traces to the brief.
  human:
    approver: designer
    where: in the tool
    criteria: The designer approves the sketch.
modes:
  default: assist
  allowed: [manual, assist]
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
    note: Invented.
decision_log:
  - Invented.
writes_back:
  - artifact: style_guide
    what: Invented.
  - artifact: glossary
    what: Invented.
---

Invented fixture for the validator parity test. Not a real function.

## Purpose

Invented.

## How each mode plays out

Invented.

## Example

Invented.

## Open points

None; this file is broken on purpose.
