import { describe, expect, it } from "vitest";
import { cardStatus } from "./index.ts";

describe("cardStatus", () => {
  it("accepts the statuses in docs/architecture.md", () => {
    expect(cardStatus.options).toEqual(["backlog", "ready", "in_progress", "needs_input", "review", "done"]);
  });

  it("rejects anything else", () => {
    expect(cardStatus.safeParse("blocked").success).toBe(false);
  });
});
