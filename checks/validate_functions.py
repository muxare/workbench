#!/usr/bin/env python3
"""Check every function file against the template and the artifact list.

Usage: python3 checks/validate_functions.py   (run from the repo root)
Needs PyYAML: pip install pyyaml
Exit code 0 when everything passes, 1 when there are errors.
"""
import pathlib
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROCESS = ROOT / "process"
ROLES = {"ux", "fe", "be", "team"}
MODES = {"manual", "assist", "delegate"}
ACTORS = {"human", "ai", "both", "none"}
PROTOCOL_KEYS = ("opens", "asks", "writes", "decides")
REQUIRED = ("template", "name", "role", "title", "summary", "inputs", "outputs",
            "checks", "modes", "protocols", "decision_log")


def front_matter(path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError("no front matter")
    end = text.find("\n---", 4)
    if end < 0:
        raise ValueError("front matter is not closed")
    return yaml.safe_load(text[4:end]) or {}, text[end + 4:]


def main():
    errors, warnings = [], []
    template_meta, _ = front_matter(PROCESS / "template.md")
    version = template_meta.get("template")

    art_meta, _ = front_matter(PROCESS / "artifacts.md")
    artifacts = {}
    for a in art_meta.get("artifacts", []):
        if a["id"] in artifacts:
            errors.append(f"artifacts.md: duplicate id {a['id']}")
        artifacts[a["id"]] = a
        for key in ("name", "owner", "made_by", "fields"):
            if key not in a:
                errors.append(f"artifacts.md: {a['id']} has no {key}")

    functions = {}
    for path in sorted((PROCESS / "functions").glob("*/*.md")):
        rel = path.relative_to(ROOT)
        try:
            fm, body = front_matter(path)
        except ValueError as exc:
            errors.append(f"{rel}: {exc}")
            continue
        functions[fm.get("name")] = (rel, fm, body)
        err = lambda msg: errors.append(f"{rel}: {msg}")

        for key in REQUIRED:
            if key not in fm:
                err(f"missing field '{key}'")
        if fm.get("template") != version:
            err(f"template is {fm.get('template')}, current version is {version}")
        if fm.get("name") != path.stem:
            err(f"name '{fm.get('name')}' does not match file name '{path.stem}'")
        if fm.get("role") != path.parent.name or fm.get("role") not in ROLES:
            err(f"role '{fm.get('role')}' must match folder '{path.parent.name}' and be one of {sorted(ROLES)}")

        for section in ("inputs", "context", "outputs"):
            for item in fm.get(section) or []:
                aid = item.get("artifact")
                if aid not in artifacts:
                    err(f"{section}: unknown artifact '{aid}'")
                    continue
                if section == "inputs" and "required" not in item:
                    err(f"inputs: '{aid}' has no 'required'")
                if section in ("inputs", "context"):
                    src = item.get("from")
                    if src != artifacts[aid]["made_by"]:
                        err(f"{section}: '{aid}' says from '{src}', artifacts.md says made_by '{artifacts[aid]['made_by']}'")

        checks = fm.get("checks") or {}
        for layer in ("structural", "consistency"):
            rules = checks.get(layer) or []
            if not rules:
                err(f"checks.{layer} is empty")
            for rule in rules:
                if not rule.get("id") or not rule.get("rule"):
                    err(f"checks.{layer}: every rule needs id and rule")
        human = checks.get("human") or {}
        for key in ("approver", "where", "criteria"):
            if not human.get(key):
                err(f"checks.human has no {key}")

        modes = fm.get("modes") or {}
        allowed = set(modes.get("allowed") or [])
        if not allowed <= MODES:
            err(f"modes.allowed has unknown modes {sorted(allowed - MODES)}")
        if modes.get("default") not in allowed:
            err("modes.default is not in modes.allowed")
        protocols = fm.get("protocols") or {}
        for mode in allowed:
            p = protocols.get(mode)
            if not p:
                err(f"protocols: no protocol for allowed mode '{mode}'")
                continue
            for key in PROTOCOL_KEYS:
                if p.get(key) not in ACTORS:
                    err(f"protocols.{mode}.{key} must be one of {sorted(ACTORS)}")
            if p.get("decides") != "human":
                err(f"protocols.{mode}.decides must be human")

        for item in fm.get("writes_back") or []:
            if item.get("artifact") not in artifacts:
                err(f"writes_back: unknown artifact '{item.get('artifact')}'")

        for heading in ("## Purpose", "## How each mode plays out", "## Example", "## Open points"):
            if heading not in body:
                err(f"body has no '{heading}' section")

    # Cross-checks between functions and the artifact list
    for aid, a in artifacts.items():
        maker = a["made_by"]
        if maker in functions:
            rel, fm, _ = functions[maker]
            if aid not in [o.get("artifact") for o in fm.get("outputs") or []]:
                errors.append(f"artifacts.md: {aid} made_by {maker}, but {rel} does not output it")
        used = any(aid in [i.get("artifact") for i in (fm.get("inputs") or []) + (fm.get("context") or [])]
                   for _, fm, _ in functions.values())
        if maker in functions and not used:
            warnings.append(f"{aid} is made by {maker} but no drafted function reads it yet")

    for w in warnings:
        print(f"note: {w}")
    for e in errors:
        print(f"error: {e}")
    print(f"{len(functions)} functions, {len(artifacts)} artifacts, {len(errors)} errors, {len(warnings)} notes")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
