import { describe, expect, it } from "vitest";
import { cardStatus } from "@workbench/shared";
import { columnLabel } from "./columns.ts";

describe("columnLabel", () => {
  it("has a label for every shared status", () => {
    for (const status of cardStatus.options) expect(columnLabel(status)).not.toBe("");
  });
});
