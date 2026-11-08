---
# Invented fixture: values the Python validator reads in its own way.
# `template: yes` is a YAML 1.1 boolean, and True == 1 in Python, so it passes.
# `allowed` is a string, which Python turns into a set of characters.
template: yes
name: python_quirks
role: be
title: Python quirks
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

Invented fixture for the validator parity test. Not a real function.

## Purpose

Invented.

## How each mode plays out

Invented.

## Example

Invented.

## Open points

None; this file is broken on purpose.
