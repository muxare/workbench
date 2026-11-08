---
# Invented fixture: unknown modes, a default that is not allowed, a missing
# protocol, unknown actors and protocols where someone other than a human decides.
template: 1
name: bad_modes
role: be
title: Bad modes
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
  default: delegate
  allowed: [manual, autopilot, assist]
protocols:
  manual:
    opens: human
    asks: robot
    writes: human
    decides: ai
  assist:
    opens: human
    writes: both
    decides: both
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
