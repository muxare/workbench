---
# Invented fixture: every kind of broken check.
template: 1
name: bad_checks
role: team
title: Bad checks
summary: Invented.
inputs: []
outputs: []
checks:
  structural:
    - id: no_rule
    - rule: No id.
    - id: fatal_rule
      rule: Unknown severity.
      severity: fatal
    - id: null_severity
      rule: Severity present but empty.
      severity:
    - id: ok_warning
      rule: A valid warning.
      severity: warning
  consistency:
    - id: has_severity
      rule: Severity on a consistency rule.
      severity: warning
  human:
    approver: lead
    where: ""
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
