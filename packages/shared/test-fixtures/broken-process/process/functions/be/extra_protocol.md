---
# Invented fixture: protocols for modes that are not allowed. A human must
# still decide in each of them.
template: 1
name: extra_protocol
role: be
title: Extra protocol
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
  assist:
    opens: human
    asks: ai
    writes: human
  delegate:
    opens: ai
    asks: none
    writes: ai
    decides: ai
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
