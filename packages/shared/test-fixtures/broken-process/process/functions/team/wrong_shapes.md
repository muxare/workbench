---
# Invented fixture: fields of the wrong shape inside the sections.
template: 1
name: wrong_shapes
role: team
title: Wrong shapes
summary: Invented.
inputs: brief
context:
  artifact: brief
outputs:
  - brief
checks:
  structural: A rule written as text.
  consistency:
    id: b
    rule: A mapping instead of a list.
  human: [lead]
modes:
  default: manual
  allowed: [manual]
protocols:
  manual: human
writes_back: style_guide
decision_log: []
---

Invented fixture for the validator tests. Not a real function.

## Purpose

Invented.

## How each mode plays out

Invented.

## Example

Invented.

## Open points

None; this file is broken on purpose.
