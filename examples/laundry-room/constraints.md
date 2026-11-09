---
# INVENTED EXAMPLE. Birchview Housing Cooperative and everyone named here are made up.
# This is the file as it stood when the project started on 2026-09-01. The proposals
# accepted during the project are described in history.md, not applied here.
artifact: constraints
time: >-
  Working service by the annual meeting on 2027-03-01. The board calls the date fixed.
budget: >-
  SEK 180,000 (invented) for design and build, approved by the board. Running costs
  must stay under SEK 1,000 a month.
technology: >-
  A web app that works on residents' own phones and computers; no app-store app. The
  cooperative has no existing systems apart from its website and a shared email box.
  There is no network point in the laundry room.
regulation: >-
  GDPR applies to residents' names, apartment numbers and booking history. Personal
  data is kept no longer than twelve months.
team_conventions: >-
  Issues are sized S, M or L; the largest size allowed is M, and an L is split before
  it is picked. Every issue names one role (po, ux, fe or be). Contracts are reviewed
  by the backend and frontend developers together.
---

> **Invented example.** These constraints, the cooperative and every person in it are made up for developing and demonstrating the workbench. Nothing here describes a real client.

Constraints are the team's standing context: the steps read them and never change them directly. Changes arrive as `writes_back` proposals that the product owner, Robin Example (invented), accepts or rejects for the team.

Two things are missing from this file on purpose, because the project found them later. The regulation line says nothing about who may see whose bookings; the cooperative's own privacy rule turns up during `refine_ui_spec` (`history.md`, step 4). And nothing says where fault data lives; the dependency on the caretaker's records turns up in `write_issues` and again in `define_api_contract` (steps 3 and 7).
