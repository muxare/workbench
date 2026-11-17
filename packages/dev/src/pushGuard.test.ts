import { describe, expect, it } from "vitest";
import { pushesIn, refusal } from "./pushGuard.ts";

describe("pushesIn", () => {
  it("reads the checked-out branch for a bare push, a remote, HEAD and @", () => {
    for (const cmd of ["git push", "git push origin", "git push -u origin HEAD", "git push origin @", "git push -o ci.skip origin"]) {
      expect(pushesIn(cmd), cmd).toEqual([{ dir: undefined, branches: ["HEAD"] }]);
    }
  });

  it("reads a named branch, a src:dst refspec, refs/heads and a forced push", () => {
    expect(pushesIn("git push origin wb/20-x")).toEqual([{ dir: undefined, branches: ["wb/20-x"] }]);
    expect(pushesIn("git push origin HEAD:wb/20-x")).toEqual([{ dir: undefined, branches: ["wb/20-x"] }]);
    expect(pushesIn("git push origin +refs/heads/wb/20-x")).toEqual([{ dir: undefined, branches: ["wb/20-x"] }]);
  });

  it("treats a URL as the remote, so a token push of HEAD reads the checked-out branch", () => {
    expect(pushesIn('git push "https://x-access-token:abc@github.com/muxare/workbench.git" HEAD')).toEqual([
      { dir: undefined, branches: ["HEAD"] },
    ]);
    expect(pushesIn("git push -q https://x-access-token:$T@github.com/muxare/workbench.git wb/18-y 2>&1 | sed s/x/y/")).toEqual([
      { dir: undefined, branches: ["wb/18-y"] },
    ]);
  });

  it("does not count a delete, tags, all or mirror as work on a card", () => {
    for (const cmd of [
      "git push origin --delete wb/20-x",
      "git push -d origin wb/20-x",
      "git push origin :wb/20-x",
      "git push --tags",
      "git push --all origin",
      "git push --mirror origin",
    ]) {
      expect(pushesIn(cmd), cmd).toEqual([]);
    }
  });

  it("reads only the push in a compound command, not branch names elsewhere", () => {
    expect(pushesIn("git commit -m 'see wb/7-foo' && git push")).toEqual([{ dir: undefined, branches: ["HEAD"] }]);
    expect(pushesIn("echo wb/7-foo; git status")).toEqual([]);
  });

  it("follows a preceding cd and git -C to the directory the push runs in", () => {
    expect(pushesIn("cd .claude/worktrees/wb-20 && git push")).toEqual([{ dir: ".claude/worktrees/wb-20", branches: ["HEAD"] }]);
    expect(pushesIn("git -C /repo/wt push origin")).toEqual([{ dir: "/repo/wt", branches: ["HEAD"] }]);
    expect(pushesIn("cd /repo && git -C wt -c core.x=1 push")).toEqual([{ dir: "/repo/wt", branches: ["HEAD"] }]);
    expect(pushesIn("GIT_TRACE=1 git push origin wb/3-z")).toEqual([{ dir: undefined, branches: ["wb/3-z"] }]);
  });

  it("finds no push in other git commands", () => {
    expect(pushesIn("git status && git log --oneline -1")).toEqual([]);
    expect(pushesIn("git branch -d wb/17-x")).toEqual([]);
  });
});

describe("refusal", () => {
  it("allows the working lanes", () => {
    for (const lane of ["in_progress", "review", "needs_input"]) expect(refusal("20", lane)).toBeUndefined();
  });

  it("refuses Backlog, Ready, Done and an unknown card with a fix", () => {
    expect(refusal("14", "ready")).toMatch(/pick card #14 first/);
    expect(refusal("10", "backlog")).toMatch(/move card #10 to Ready/);
    expect(refusal("16", "done")).toMatch(/enter a new card/);
    expect(refusal("99", undefined)).toMatch(/no card #99/);
  });
});
