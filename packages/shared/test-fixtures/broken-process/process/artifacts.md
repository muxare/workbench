---
# Invented fixture for the validator tests (packages/shared/src/functionValidator.test.ts).
# Not the real artifact list; every entry is made up and some are broken on purpose.
template: 1
artifacts:
  - id: brief
    name: Brief
    owner: stakeholders
    made_by: external
    fields: [request]
  # Duplicate id
  - id: brief
    name: Brief again
    owner: stakeholders
    made_by: external
    fields: [request]
  - id: sketch
    name: Sketch
    owner: ux
    made_by: draft_sketch
    fields: [frames]
  # Missing owner and fields; made by draft_sketch, which does not output it
  - id: notes
    name: Notes
    made_by: draft_sketch
  # Output and read by draft_sketch
  - id: plan
    name: Plan
    owner: ux
    made_by: draft_sketch
    fields: [steps]
  - id: style_guide
    name: Style guide
    owner: team
    made_by: external
    fields: [rules]
  # Output by draft_sketch but read by no function: a note, not an error
  - id: handout
    name: Handout
    owner: ux
    made_by: draft_sketch
    fields: [pages]
  # No made_by, and draft_sketch reads it: reported once, here
  - id: loose_notes
    name: Loose notes
    owner: ux
    fields: [text]
  # Not a mapping
  - just a string
  # No id
  - name: Nameless
    owner: ux
    made_by: external
    fields: []
---

# Artifacts (invented fixture)
