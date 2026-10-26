---
template: 1
name: define_api_contract
role: be
title: Agree the API contract
summary: Writes the API the frontend needs as a contract file both sides build against, before either side builds.
inputs:
  - artifact: refined_ui_spec
    required: true
    from: refine_ui_spec
  - artifact: issues
    required: true
    from: write_issues
  - artifact: domain_rules
    required: true
    from: external
context:
  - artifact: codebase
    from: external
  - artifact: constraints
    from: external
tacit:
  - Existing APIs and data the backend developer knows can or cannot be reused.
  - Load, security or data-ownership limits not written down anywhere.
  - Which domain rules stakeholders consider fixed and which they would trade.
outputs:
  - artifact: api_contract
  - artifact: contract_questions
checks:
  structural:
    - id: openapi_valid
      rule: The contract is valid OpenAPI 3.1.
    - id: errors_defined
      rule: Every endpoint defines its error responses, not only the success response.
    - id: auth_declared
      rule: Every endpoint declares its auth requirement.
    - id: examples_present
      rule: Every response schema has at least one example.
  consistency:
    - id: data_needed_served
      rule: Every item in the refined UI spec's data_needed is served by an endpoint.
    - id: rules_respected
      rule: No endpoint lets a client break a domain rule.
    - id: reuse_checked
      rule: Where the codebase already has an endpoint for the same data, the contract reuses it or says why not.
  human:
    approver: backend and frontend developers together
    where: in a short contract review
    criteria: Both sides sign off; open contract questions have an owner.
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
    note: The AI checks the draft against the refined spec and the codebase, and asks about missing errors, auth and reuse.
  delegate:
    opens: human
    asks: both
    writes: ai
    decides: human
    note: The backend developer states the resource model in a sentence or two. The AI drafts the OpenAPI file, examples and contract questions; both developers review it together.
decision_log:
  - Contract questions asked and who answered them.
  - Endpoints reused, added or rejected, and why.
writes_back:
  - artifact: constraints
    what: Load, security or data-ownership limits confirmed during review.
---

## Purpose

When frontend and backend agree the API late, mismatches show up at integration and both sides rework. A contract file agreed first lets both sides build at the same time, frontend against mocks, backend against contract tests. It is also the clearest input an agent can get.

The data model and boundaries behind the contract are the backend developer's judgment, so the default is `assist`.

## How each mode plays out

**manual.** The backend developer writes the contract, and the two sides review it together.

**assist.** The backend developer writes. The AI compares the draft with the refined UI spec and the codebase. It flags data the frontend needs but no endpoint serves, missing error cases and existing endpoints that could be reused.

**delegate.** The backend developer describes the resource model in a sentence or two. The AI drafts the OpenAPI file with examples and lists contract questions. Both developers review and sign off together.

## Example

Invented example, continuing refine_ui_spec's.

```yaml
paths:
  /faults/{faultId}/status:
    get:
      summary: Current status of a reported fault
      security: [{ tenantAuth: [] }]
      responses:
        "200":
          content:
            application/json:
              example: { faultId: "F-1042", status: scheduled, reportedAt: "2026-10-02", scheduledAt: "2026-10-09" }
        "404": { description: Fault not found or not the tenant's }
        "503": { description: Contractor status unavailable }
```

Contract question: Does the contractor's system expose a scheduled time, or only a date? Asked of: the client.

## Open points

- Where do mocks and contract tests come from: this step, or the next step (agree_contract in the process map)?
- Does the contract live in this repo or in the product's repo?
