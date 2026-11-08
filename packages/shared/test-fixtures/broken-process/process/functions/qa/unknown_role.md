---
# Invented fixture: the role matches the folder but is not a known role.
template: 1
name: unknown_role
role: qa
title: Unknown role
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

Invented fixture for the validator tests. Not a real function.

## Purpose

Invented.

## How each mode plays out

Invented.

## Example

Invented.

## Open points

None; this file is broken on purpose.
