---
# INVENTED EXAMPLE. Birchview Housing Cooperative and everyone named here are made up.
# This is the file as it stood when the project started on 2026-09-01. The proposals
# accepted during the project are described in history.md, not applied here.
artifact: domain_rules
rules:
  - rule: A resident holds at most two future bookings at a time. A third booking is refused until one of the two has passed or been cancelled.
    example: >-
      Apartment 1203 holds Tuesday 18:00-21:00 and Saturday 09:00-12:00. A booking for
      Thursday is refused; once Tuesday's slot has passed, Thursday can be booked.
    source: >-
      The cooperative's laundry-room rules, adopted by the board in 2024 (invented) and
      posted on the laundry-room door. Today the padlock pegs enforce it: each
      apartment has two.
  - rule: Opening hours are set by the board, and a slot can only be booked inside them. The board changes them by decision, without notice to the team.
    example: >-
      Weekdays 07:00-22:00 and weekends 08:00-20:00, in three-hour slots, with the
      last weekday slot 19:00-22:00. The board moved the weekend start from 09:00 to
      08:00 in spring 2026 (invented).
    source: >-
      Board decisions, recorded in the minutes and copied into the laundry-room rules
      by Morgan Example (invented), chair of the board.
  - rule: A machine fault is known to the cooperative once the caretaker has it in his fault records. A machine's state and a fault's progress are what those records say, and only the caretaker changes them.
    example: >-
      Washer 3 stops mid-cycle on 2026-08-12. Lee writes it in his records that
      afternoon, books the repair firm for 2026-08-18 and marks it fixed after the
      visit. Until then, Washer 3 is out of order whatever anyone else reports.
    source: >-
      Lee Example (invented), the caretaker, who takes the fault calls, keeps the
      records and calls in the repair firm.
---

> **Invented example.** These rules, the cooperative and every person in it are made up for developing and demonstrating the workbench. Nothing here describes a real client.

Domain rules belong to the stakeholders: they are the cooperative's own rules, which hold whatever the service looks like. `define_api_contract` reads them as a required input, and its consistency check `rules_respected` asks that no endpoint lets a client break one. That is why the third booking is answered with a 409 and a reason in step 5 of `history.md`, and why Pat computes slots from opening hours instead of storing them: the hours change when the board says so.

The third rule says where fault status comes from, but not what form the caretaker's records take. That they are a notebook and a spreadsheet on Lee's own laptop, and that no system holds them, is what Pat knew and the files did not say (`history.md`, step 3). `write_issues` does not read this file at all, and the gap shows up as a source nobody can serve in steps 6 and 7.

Two things are absent on purpose. Booking bans are not a rule: the board wants them and the residents oppose them, and the board decides on 2026-10-14 (`history.md`, "After the segment"). The privacy rule on names and apartment numbers is a constraint the team must respect, not a rule of the laundry room, so it belongs in `constraints`, where it is missing at the start and is added in step 4. Because it is not here, `rules_respected` could not catch the `bookedBy` field in step 5.
