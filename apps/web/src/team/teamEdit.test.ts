// INVENTED test data: the people and steps are made up for the test.
import { describe, expect, it } from "vitest";
import { teamResponse, type HumanTeammate, type TeamResponse } from "@workbench/shared";
import { ApiRequestError } from "../api/client.ts";
import { readChangingAs, rememberChangingAs } from "./changingAsStore.ts";
import {
  addFailure,
  addFormId,
  addFormProblems,
  addRequest,
  changingAs,
  changingAsChoices,
  editedRoles,
  emptyAddForm,
  followHeldRoles,
  hasProblems,
  leaveFailure,
  leaveQuestion,
  leaveRequest,
  roleOptions,
  rolesFailure,
} from "./teamEdit.ts";

const team: TeamResponse = teamResponse.parse({
  steps: [
    { function_id: "shape_widget", role: "fe", title: "Shape the widget", summary: "Invented." },
    { function_id: "test_widget", role: "fe", title: "Test the widget", summary: "Invented." },
    { function_id: "design_widget", role: "ux", title: "Design the widget", summary: "Invented." },
    { function_id: "retro_widget", role: "team", title: "Look back", summary: "Invented." },
  ],
  people: [
    { teammate: { kind: "human", id: "inv-fe", name: "Invented developer", roles: ["fe"], process_profile: {} }, cells: [] },
    { teammate: { kind: "human", id: "inv-po", name: "Invented owner", roles: ["po", "ux"], process_profile: {} }, cells: [] },
  ],
});
const noPeople: TeamResponse = { ...team, people: [] };
const person = team.people[0]!.teammate as HumanTeammate;

describe("changingAs", () => {
  it("lists every person as a choice, labelled by main role and name", () => {
    expect(changingAsChoices(team)).toEqual([
      { id: "inv-fe", label: "FE · Invented developer" },
      { id: "inv-po", label: "PO · Invented owner" },
    ]);
  });

  it("keeps the remembered person while they are on the team", () => {
    expect(changingAs(team, "inv-fe")).toBe("inv-fe");
  });

  it("falls back to the product owner, then the first person, when nothing usable is remembered", () => {
    expect(changingAs(team, undefined)).toBe("inv-po");
    expect(changingAs(team, "someone-gone")).toBe("inv-po");
    expect(changingAs({ ...team, people: team.people.slice(0, 1) }, undefined)).toBe("inv-fe");
  });

  it("is nobody on a team with no person", () => {
    expect(changingAs(noPeople, "inv-fe")).toBeUndefined();
  });
});

describe("changingAsStore", () => {
  it("reads back what it remembered", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(readChangingAs(storage)).toBeUndefined();
    rememberChangingAs("inv-fe", storage);
    expect(readChangingAs(storage)).toBe("inv-fe");
  });

  it("does without storage that throws or is missing", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readChangingAs(throwing)).toBeUndefined();
    expect(() => rememberChangingAs("inv-fe", throwing)).not.toThrow();
    expect(readChangingAs(undefined)).toBeUndefined();
  });
});

describe("roleOptions", () => {
  it("offers every role a person may hold, with how many steps in the team's steps it owns", () => {
    expect(roleOptions(team).map((o) => [o.role, o.title, o.steps, o.hint])).toEqual([
      ["po", "Product owner", 0, "no steps"],
      ["ux", "UX designer", 1, "1 step"],
      ["fe", "Frontend developer", 2, "2 steps"],
      ["be", "Backend developer", 0, "no steps"],
    ]);
  });
});

describe("editedRoles", () => {
  it("puts the main role first and keeps the person's order for the rest, adding new roles in the shared order", () => {
    expect(editedRoles(["fe", "ux"], new Set(["fe", "ux", "be", "po"]), "fe")).toEqual(["fe", "ux", "po", "be"]);
    expect(editedRoles(["fe", "ux"], new Set(["fe", "ux"]), "ux")).toEqual(["ux", "fe"]);
  });

  it("falls back to the first remaining role when the main role is unchecked", () => {
    expect(editedRoles(["fe", "ux"], new Set(["ux"]), "fe")).toEqual(["ux"]);
    expect(editedRoles([], new Set(["be", "ux"]), undefined)).toEqual(["ux", "be"]);
  });

  it("is empty when nothing is checked", () => {
    expect(editedRoles(["fe"], new Set(), "fe")).toEqual([]);
  });

});

describe("followHeldRoles", () => {
  it("follows new roles when there is no unsaved change", () => {
    expect(followHeldRoles(person, ["fe"], ["fe", "ux"], ["fe"])).toEqual({ draft: ["fe", "ux"], notice: undefined });
  });

  it("follows a save, whose answer is what the draft held", () => {
    expect(followHeldRoles(person, ["fe"], ["ux", "fe"], ["ux", "fe"])).toEqual({ draft: ["ux", "fe"], notice: undefined });
  });

  it("keeps an unsaved change when someone else changes the roles, and says so", () => {
    const next = followHeldRoles(person, ["fe"], ["fe", "be"], ["fe", "ux"]);
    expect(next.draft).toEqual(["fe", "ux"]);
    expect(next.notice).toBe(
      "Someone changed Invented developer's roles meanwhile; they now hold Frontend developer, Backend developer. Your unsaved change is kept: Save replaces theirs, Undo shows them.",
    );
  });

  it("leaves the draft alone when the roles did not change", () => {
    expect(followHeldRoles(person, ["fe"], ["fe"], ["fe", "ux"])).toEqual({ draft: ["fe", "ux"], notice: undefined });
  });
});

describe("the add form", () => {
  const filled = { name: "Invented Newcomer", id: "", roles: ["be" as const] };

  it("uses the id the name suggests unless one is typed", () => {
    expect(addFormId(filled)).toBe("invented-newcomer");
    expect(addFormId({ ...filled, id: "  inv-new " })).toBe("inv-new");
  });

  it("has no problem when it has a name, a plain free id and a role", () => {
    expect(addFormProblems(filled, team)).toEqual({});
    expect(hasProblems(addFormProblems(filled, team))).toBe(false);
  });

  it("asks for a name and a role on an empty form, and no id until there is a name", () => {
    expect(addFormProblems(emptyAddForm, team)).toEqual({ name: "Give the person's name.", roles: "Choose at least one role." });
  });

  it("asks for an id when the name suggests none", () => {
    expect(addFormProblems({ ...filled, name: "—" }, team).id).toMatch(/suggests no id/);
  });

  it("refuses an id that is not plain, and one a person on the team holds", () => {
    expect(addFormProblems({ ...filled, id: "Not Plain" }, team).id).toMatch(/lower-case letters and digits/);
    expect(addFormProblems({ ...filled, id: "inv-fe" }, team).id).toBe("There is already a teammate 'inv-fe'; choose another id.");
    expect(addFormProblems({ ...filled, name: "Inv FE" }, team).id).toMatch(/already a teammate 'inv-fe'/);
  });

  it("sends the trimmed name, the id and the roles as the chosen person, or as the new person on an empty team", () => {
    const form = { ...filled, name: "  Invented Newcomer ", roles: ["be" as const, "fe" as const] };
    expect(addRequest(form, "inv-po")).toEqual({ actor: "inv-po", id: "invented-newcomer", name: "Invented Newcomer", roles: ["be", "fe"] });
    expect(addRequest(form, undefined).actor).toBe("invented-newcomer");
  });
});

describe("failure messages", () => {
  it("shows the API's reason for a refused add, and a sentence for anything else", () => {
    expect(addFailure(new ApiRequestError("conflict", "there is already a teammate 'x'; choose another id", 409))).toBe(
      "there is already a teammate 'x'; choose another id",
    );
    expect(addFailure(new ApiRequestError("network", "the API cannot be reached"))).toBe("the API cannot be reached");
    expect(addFailure(new Error("boom"))).toBe("the person could not be added");
  });

  it("says someone else changed the roles on a 409, and shows the API's reason otherwise", () => {
    expect(rolesFailure(new ApiRequestError("conflict", "inv-fe holds fe, ux, not fe", 409), person)).toBe(
      "someone changed Invented developer's roles in the meantime",
    );
    expect(rolesFailure(new ApiRequestError("server_error", "the API answered 500", 500), person)).toBe("the API answered 500");
    expect(rolesFailure(new Error("boom"), person)).toBe("the roles could not be saved");
  });
});

describe("taking a person off the team", () => {
  it("is sent as the person chosen under Changing as", () => {
    expect(leaveRequest("inv-po")).toEqual({ actor: "inv-po" });
  });

  it("asks first, naming who it is recorded as and that the id cannot be used again", () => {
    expect(leaveQuestion(person, "inv-po", team)).toBe(
      "Take Invented developer off the team, recorded as made by Invented owner? Their cards and log entries stay and keep their name; the id inv-fe cannot be used again.",
    );
    expect(leaveQuestion(person, "inv-fe", team)).toMatch(/recorded as made by Invented developer themselves\?/);
  });

  it("shows the API's reason for a refusal, says someone else was first on a 409, and a sentence for anything else", () => {
    const owns = "Invented developer owns #3, which is not done; a person leaves once every card they own is done or withdrawn";
    expect(leaveFailure(new ApiRequestError("rule_violation", owns, 422), person)).toBe(owns);
    expect(leaveFailure(new ApiRequestError("conflict", "Invented developer has already left the team", 409), person)).toBe(
      "someone took Invented developer off the team in the meantime",
    );
    expect(leaveFailure(new ApiRequestError("network", "the API cannot be reached"), person)).toBe("the API cannot be reached");
    expect(leaveFailure(new Error("boom"), person)).toBe("Invented developer could not be taken off the team");
  });
});
