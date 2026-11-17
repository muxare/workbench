// INVENTED test data: the names and ids are made up for the test.
import { describe, expect, it } from "vitest";
import { addTeammateRequest, newTeammateId, teammateIdFromName } from "./api.ts";

describe("teammateIdFromName", () => {
  it("lower-cases, drops accents and joins words with single hyphens", () => {
    expect(teammateIdFromName("Åsa Öberg-Lind")).toBe("asa-oberg-lind");
    expect(teammateIdFromName("  Invented   Person 2 ")).toBe("invented-person-2");
    expect(teammateIdFromName("O'Neil & Co.")).toBe("o-neil-co");
  });

  it("is empty when the name has no letter or digit to build from", () => {
    expect(teammateIdFromName("")).toBe("");
    expect(teammateIdFromName("—")).toBe("");
    expect(teammateIdFromName("李")).toBe("");
  });

  it("is cut to 40 characters without a trailing hyphen", () => {
    const id = teammateIdFromName(`${"a".repeat(39)} b`);
    expect(id).toBe("a".repeat(39));
    expect(newTeammateId.safeParse(id).success).toBe(true);
  });

  it("always suggests an id the request accepts, or none", () => {
    for (const name of ["Invented Name", "x", "1 2 3", "Ünïcödé Ñame", "a--b"]) {
      const id = teammateIdFromName(name);
      expect(id === "" || newTeammateId.safeParse(id).success).toBe(true);
    }
  });
});

describe("addTeammateRequest", () => {
  const ok = { actor: "invented-po", id: "invented-new", name: "Invented newcomer", roles: ["fe", "ux"] };

  it("accepts a name, a plain id and at least one role", () => {
    expect(addTeammateRequest.parse(ok)).toEqual(ok);
  });

  it("trims the name and refuses an empty one", () => {
    expect(addTeammateRequest.parse({ ...ok, name: "  Invented  " }).name).toBe("Invented");
    expect(addTeammateRequest.safeParse({ ...ok, name: "   " }).success).toBe(false);
  });

  it("refuses an id that is not plain, no roles, a repeated role and an unknown role", () => {
    for (const id of ["", "Invented", "a b", "-a", "a-", "a--b", "a/b", "a".repeat(41)]) {
      expect(addTeammateRequest.safeParse({ ...ok, id }).success).toBe(false);
    }
    expect(addTeammateRequest.safeParse({ ...ok, roles: [] }).success).toBe(false);
    expect(addTeammateRequest.safeParse({ ...ok, roles: ["fe", "fe"] }).success).toBe(false);
    expect(addTeammateRequest.safeParse({ ...ok, roles: ["team"] }).success).toBe(false);
  });

  it("refuses a field it does not know, such as a process profile", () => {
    expect(addTeammateRequest.safeParse({ ...ok, process_profile: {} }).success).toBe(false);
  });
});
