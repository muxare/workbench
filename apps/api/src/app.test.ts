import { describe, expect, it } from "vitest";
import { app } from "./app.ts";

describe("GET /api/health", () => {
  it("answers with the card statuses from the shared package", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, statuses: expect.arrayContaining(["needs_input"]) });
  });
});
