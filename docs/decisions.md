# Decisions

Newest first. Each entry: what was decided, why, and what would change it.

## 2026-10-26: First review of the segment drafts (with Mikael)

- **Artifact files keep their fields in YAML front matter**, prose below. Structural checks read only the front matter. Convention in `docs/runs.md`.
- **Human sign-off is recorded in `approval.md` in each step folder of a run.** A run convention, not a template field.
- **Failed checks and waiting on another role are not modeled yet.** We add fields for them only if the Phase 2 run shows they are needed.
- **`writes_back` creates a proposal that the owning role accepts or rejects.** It never edits another role's artifact directly.
- **Structural rules can be `severity: warning`.** Used for rules code can only approximate. frame_problem's solution word list became a warning; a new consistency rule makes the real call.
- **Team habits such as issue size live in `constraints.team_conventions`**, not in function rules.
- **define_api_contract takes `issues` as optional.** The refined UI spec already lists the data needed.

## 2026-10-23: Phase 0 and 1 drafts (made by Claude while Mikael was away, to review)

- **Function files are markdown with YAML front matter.** Readable by people, parseable by the validator, skills and a later UI. Would change if the front matter grows too large to read, then move to YAML plus a separate notes file.
- **Mode names in files are `manual`, `assist`, `delegate`.** They match the process map's "I do it", "AI assists, I drive", "AI does it, I verify".
- **Protocol roles take `human`, `ai`, `both` or `none`, and `decides` is always `human`.** The validator enforces it.
- **Required artifact fields are defined once, in `artifacts.md`.** Function files list artifact ids only, so a field is never defined twice.
- **Inputs carry `from`, and the validator checks it against `made_by`.** That keeps the chain's links consistent as functions are added.
- **`writes_back` is a new optional field.** It records tacit knowledge to copy into a context artifact after a step (from the frame_problem discussion: the conversation is an artifact).
- **`write_issues` takes `ui_spec` and `acceptance_criteria` as inputs**, not only the problem framing. Issues need testable criteria, which come from the handoff spec.
- **Open questions are split by who must answer:** `client_questions`, `design_questions`, `contract_questions`.
- **Default modes in the segment:** frame_problem `assist`, write_issues `delegate`, refine_ui_spec `assist`, define_api_contract `assist`. The process map suggested `manual` for frame_problem; `assist` fits the agreed idea that the AI asks while the designer writes.
