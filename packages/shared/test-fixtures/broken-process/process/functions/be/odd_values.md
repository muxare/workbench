---
# Invented fixture: values that look almost right.
# `template: yes` is a YAML 1.1 boolean, not version 1.
# `allowed` is a string, not a list of modes.
template: yes
name: odd_values
role: be
title: Odd values
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
  allowed: manual
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
