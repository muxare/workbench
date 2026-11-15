// The database URL is read when asked for, not when client.ts loads, so a
// command that sets DATABASE_URL after its imports (team:serve) still gets
// its own database rather than apps/api/data/workbench.db.
import { afterEach, describe, expect, it } from "vitest";
import { defaultDatabaseUrl, fallbackDatabaseUrl } from "./client.ts";

const before = process.env.DATABASE_URL;
afterEach(() => {
  if (before === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = before;
});

describe("defaultDatabaseUrl", () => {
  it("follows DATABASE_URL set after the module was loaded", () => {
    process.env.DATABASE_URL = "file:/tmp/some-team/board.db";
    expect(defaultDatabaseUrl()).toBe("file:/tmp/some-team/board.db");
  });

  it("falls back to the file under apps/api/data when DATABASE_URL is unset", () => {
    delete process.env.DATABASE_URL;
    expect(defaultDatabaseUrl()).toBe(fallbackDatabaseUrl);
  });
});
