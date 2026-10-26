# Workbench: notes for Claude

This repo defines a team's work as chains of functions that people and AI carry out together. It is not an app yet; it is the process model the app will be generated from.

- Read `process/template.md` before editing any function file. Follow its fields and body sections exactly.
- Refer to artifacts by `id` from `process/artifacts.md`. Add new artifacts there first.
- After any change under `process/`, run `python3 checks/validate_functions.py` and fix every error.
- In every protocol, `decides` is `human`. Never change that.
- Do not invent facts about real clients or projects. Mark examples as invented.
- A change that needs a new template field: bump the version in `process/template.md`, update every function file, and add an entry to `docs/decisions.md`.
