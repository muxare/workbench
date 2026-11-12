// Posting the AI teammate's review as the App, against a fake fetch; nothing
// here reaches GitHub. The App id, slug, installation, token, pull request and
// shas are invented.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { postReview, ReviewRefused, type ReviewRequest } from "./review.ts";

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const CREDS = { appId: "4242", privateKeyPem: PEM };
const HEAD = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";
const OTHER = "0123456789abcdef0123456789abcdef01234567";
const API = "https://api.github.com";

interface Call {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

/** A fake GitHub: the App, its installation, one pull request, and the review endpoint. */
function fakeGithub(pr: { state?: string; head?: string; author?: string } = {}) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ method, url, authorization: headers?.authorization, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const path = url.slice(API.length);
    if (method === "GET" && path === "/app") return json(200, { id: 4242, slug: "workbench-ai-invented" });
    if (method === "GET" && path === "/repos/muxare/workbench/installation") return json(200, { id: 77 });
    if (method === "POST" && path === "/app/installations/77/access_tokens") return json(201, { token: "ghs_invented", expires_at: "2026-11-12T13:00:00Z" });
    if (method === "GET" && path === "/repos/muxare/workbench/pulls/12") {
      return json(200, { number: 12, state: pr.state ?? "open", head: { sha: pr.head ?? HEAD }, user: { login: pr.author ?? "muxare" } });
    }
    if (method === "POST" && path === "/repos/muxare/workbench/pulls/12/reviews") {
      const sent = JSON.parse(String(init?.body)) as { commit_id: string; event: string };
      return json(200, {
        id: 900000040,
        html_url: "https://github.com/muxare/workbench/pull/12#pullrequestreview-900000040",
        commit_id: sent.commit_id,
        state: sent.event === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED",
      });
    }
    return json(404, { message: "Not Found" });
  }) as typeof fetch;
  return { calls, fetchFn, posts: () => calls.filter((c) => c.url.endsWith("/reviews")) };
}

const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  repo: "muxare/workbench",
  pullNumber: 12,
  event: "APPROVE",
  body: "No findings: the change does what card #12 asks (invented).",
  head: HEAD,
  ...over,
});

describe("postReview", () => {
  it("posts an approving review as the App on the head commit it was written against", async () => {
    const gh = fakeGithub();
    const review = await postReview(CREDS, request(), gh.fetchFn);
    expect(review).toEqual({ id: 900000040, url: "https://github.com/muxare/workbench/pull/12#pullrequestreview-900000040", commit: HEAD, state: "APPROVED" });
    expect(gh.calls.map((c) => `${c.method} ${c.url.slice(API.length)}`)).toEqual([
      "GET /app",
      "GET /repos/muxare/workbench/installation",
      "POST /app/installations/77/access_tokens",
      "GET /repos/muxare/workbench/pulls/12",
      "POST /repos/muxare/workbench/pulls/12/reviews",
    ]);
    const [post] = gh.posts();
    expect(post?.authorization).toBe("Bearer ghs_invented");
    expect(post?.body).toEqual({ commit_id: HEAD, body: request().body, event: "APPROVE" });
  });

  it("posts a changes request the same way", async () => {
    const gh = fakeGithub();
    const review = await postReview(CREDS, request({ event: "REQUEST_CHANGES", body: "The 503 has no Retry-After header (invented)." }), gh.fetchFn);
    expect(review.state).toBe("CHANGES_REQUESTED");
    expect(gh.posts()[0]?.body).toMatchObject({ commit_id: HEAD, event: "REQUEST_CHANGES" });
  });

  it("refuses when the head moved since the review was written, and posts nothing", async () => {
    const gh = fakeGithub({ head: OTHER });
    await expect(postReview(CREDS, request(), gh.fetchFn)).rejects.toThrow(new ReviewRefused(
      `the head of pull request #12 in muxare/workbench moved from ${HEAD} to ${OTHER} since it was read; read the new commits and review again`,
    ));
    expect(gh.posts()).toEqual([]);
  });

  it("refuses a pull request that is not open", async () => {
    const gh = fakeGithub({ state: "closed" });
    await expect(postReview(CREDS, request(), gh.fetchFn)).rejects.toThrow(/is closed, not open/);
    expect(gh.posts()).toEqual([]);
  });

  it("refuses a pull request the App opened itself, which GitHub would not let it approve", async () => {
    const gh = fakeGithub({ author: "workbench-ai-invented[bot]" });
    await expect(postReview(CREDS, request(), gh.fetchFn)).rejects.toThrow(/opened by workbench-ai-invented\[bot\], the App itself/);
    expect(gh.posts()).toEqual([]);
  });

  it("refuses a request that cannot be a review before calling GitHub", async () => {
    for (const [over, reason] of [
      [{ head: "9e8d7c6" }, /not a full 40-character commit sha/],
      [{ body: "  \n" }, /body is empty/],
      [{ repo: "workbench" }, /not owner\/name/],
      [{ pullNumber: 0 }, /not a pull request number/],
    ] as const) {
      const gh = fakeGithub();
      await expect(postReview(CREDS, request(over), gh.fetchFn)).rejects.toThrow(reason);
      expect(gh.calls).toEqual([]);
    }
  });

  it("says which call failed when GitHub refuses the review", async () => {
    const gh = fakeGithub();
    const failing = (async (url: string, init?: RequestInit) =>
      url.endsWith("/reviews") ? new Response(JSON.stringify({ message: "Unprocessable Entity" }), { status: 422 }) : gh.fetchFn(url, init)) as typeof fetch;
    await expect(postReview(CREDS, request(), failing)).rejects.toThrow("POST /repos/muxare/workbench/pulls/12/reviews: 422 Unprocessable Entity");
  });
});
