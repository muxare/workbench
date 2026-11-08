---
# Invented fixture: reuses the name draft_sketch. The Python validator keys
# functions by name, so this file replaces draft_sketch in the cross-checks.
template: 1
name: draft_sketch
role: ux
title: A second draft_sketch
summary: Invented.
inputs: []
outputs: []
checks:
  structural:
    - id: a
      rule: Invented.
  consistency:
    - id: b
      rule: Invented.
  human:
    approver: someone
    where: in the tool
    criteria: Invented.
modes:
  default: manual
  allowed: [manual]
protocols:
  manual:
    opens: human
    asks: none
    writes: human
    decides: human
decision_log: []
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
