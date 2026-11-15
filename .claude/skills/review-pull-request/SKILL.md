---
name: review-pull-request
description: Review a pull request on this repository by hand as the AI critic and post the review as the GitHub App workbench-ai-muxare, approving (the critic passes) or requesting changes (it fails). The ai-review workflow does the same review in CI on every pull request; use this when Mikael asks for the AI's review on his machine.
argument-hint: <pr-number> [owner/repo]
arguments: [pr, repo]
disable-model-invocation: true
context: fork
agent: general-purpose
background: false
allowed-tools: Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh repo view *) Bash(git fetch *) Bash(git show *) Bash(git log *) Read Grep Glob
---

# Review a pull request as the AI critic, by hand

Every pull request from this repository is reviewed by the AI critic in CI: the `ai-review` workflow (`.github/workflows/ai-review.yml`) runs Claude Code on each push and posts the review as `github-actions[bot]` (`docs/dev-loop.md`). This skill is the same review run on Mikael's machine, for a pull request from a fork, which the workflow skips, for a run the workflow could not make, or to see the findings before pushing again. It posts as the GitHub App `workbench-ai-muxare`, so it cannot review a pull request the App opened; the workflow can.

How the verdict is reached and what the review says is in [checks.md](checks.md), which the workflow uses too. Read it first and follow it; the steps below are only how this skill reads the pull request and posts the review.

The pull request is `$pr`. The repository is `$repo`; if that is empty, use the one `gh repo view --json nameWithOwner -q .nameWithOwner` names.

## 1. Read the pull request and pin the commit

Run `gh pr view $pr --json number,title,body,author,state,isDraft,url,headRefName,headRefOid,baseRefName,files`. Write down `headRefOid`: it is the commit you review, and the review is posted on it or not at all.

Stop and say why, posting nothing, when the pull request is not open, or when its author is `app/workbench-ai-muxare` (shown as `workbench-ai-muxare[bot]` elsewhere): GitHub does not let an author approve or request changes on their own pull request, so the App cannot review what it opened. Say that the `ai-review` workflow reviews those, and give your findings to the person who asked instead.

If the `mcp__workbench__get_card` tool is available, read the card with it.

## 2. Read the change and judge it

Follow [checks.md](checks.md), reading the change with:

- `gh pr diff $pr` for the whole diff.
- `git fetch origin <headRefOid>` and then `git show <headRefOid>:<path>` to read a changed file in full.
- `gh pr checks $pr` for the structural check, `check`.

## 3. Write the body

Write the body, in the shape [checks.md](checks.md) gives, to a new file under the session's scratchpad directory, or `$TMPDIR` if there is none, never inside the repository.

## 4. Post it as the App

`--request-changes` when any finding is blocking, `--approve` otherwise. Post from the repository root:

```sh
pnpm --silent --filter @workbench/api github:review <owner/repo> $pr (--approve | --request-changes) --head <headRefOid> --body-file <file>
```

`GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY_PATH` must be set, as for `github:token`; if they are not, stop and say so. The command is not pre-approved on purpose: posting leaves the machine, so the person sees the verdict and the command before it runs.

If the command answers `refused: the head of pull request … moved`, new commits were pushed while you read. Go back to step 1 once and review the new head; if it moves again, stop and say so. Any other refusal or error: stop and report it as it came.

## 5. Report

Answer with the verdict, the review's URL from the command's output, the commit it is on, and the blocking findings in one line each.
