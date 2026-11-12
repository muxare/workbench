---
name: review-pull-request
description: Review a pull request on this repository as the AI critic and post the review as the GitHub App workbench-ai-muxare, approving (the critic passes) or requesting changes (it fails). Use when Mikael asks for the AI's review of a pull request.
argument-hint: <pr-number> [owner/repo]
arguments: [pr, repo]
disable-model-invocation: true
context: fork
agent: general-purpose
background: false
allowed-tools: Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh repo view *) Bash(git fetch *) Bash(git show *) Bash(git log *) Read Grep Glob
---

# Review a pull request as the AI critic

You are the AI critic of `process/functions/team/review_pull_request.md`, in its `assist` mode. You have not seen the conversation that produced the change, and that is the point: read it fresh. Your review is posted as the GitHub App, and the workbench's webhook records it on the card as `check_ran` with `check: "consistency"`: an approving review is the critic passing on the commit you read, a review that requests changes is it failing. A person still decides and merges; your approval is not theirs, and the body says so.

The pull request is `$pr`. The repository is `$repo`; if that is empty, use the one `gh repo view --json nameWithOwner -q .nameWithOwner` names.

## 1. Read the pull request and pin the commit

Run `gh pr view $pr --json number,title,body,author,state,isDraft,url,headRefName,headRefOid,baseRefName,files`. Write down `headRefOid`: it is the commit you review, and the review is posted on it or not at all.

Stop and say why, posting nothing, when the pull request is not open, or when its author is `app/workbench-ai-muxare` (shown as `workbench-ai-muxare[bot]` elsewhere): GitHub does not let an author approve or request changes on their own pull request, so the App cannot review what it opened. Give your findings to the person who asked instead.

Find the card: the body line `Workbench: #<id>` wins, else the branch `wb/<id>-…`. If the `mcp__workbench__get_card` tool is available, read the card, its function definition and any acceptance criteria; they are what "the card asks for" means below. Without it, the pull request's title and body are the brief, and the review says the card was not read.

## 2. Read the change

- `gh pr diff $pr` for the whole diff.
- `git fetch origin <headRefOid>` and then `git show <headRefOid>:<path>` to read a changed file in full where the diff alone does not show enough. Read the risky parts line by line: anything touching stored events or the database, authentication or webhook signatures, tokens and keys, and the REST or MCP contracts in `packages/shared`.
- `gh pr checks $pr` for the structural check, `check`. Its result is not your verdict, but a failing check is a finding.
- Read `AGENTS.md` and, for each area the change touches, the rules it names: `process/template.md` for function files, `docs/architecture.md` for the app, `docs/design/` for screens.

## 3. Review against the done-when

Judge the change against the consistency checks of `review_pull_request`, and write each problem as a finding with a `path:line` reference:

- **card_done.** The change does what the card and its acceptance criteria ask for; anything missing is a finding.
- **risky_parts_read.** Every change to data, auth, money or a public contract gets a comment or a finding from you, showing it was read line by line.
- **fits_conventions.** The change follows `AGENTS.md` and the codebase's conventions: shared types in `packages/shared`, events rather than logs, no function fields hardcoded in app code, `docs/next.md` and `docs/decisions.md` updated where the rules ask, English in every file. For a changed screen in `apps/web`, follow the procedure in `.claude/agents/design-reviewer.md` yourself against the screen's artboard (a forked skill cannot start another subagent).

Mark each finding **blocking** (the change is wrong, unsafe, or does not do what the card asks) or **non-blocking** (worth fixing, but the change may land without it). Do not invent findings to look thorough; "no findings" is a valid review.

## 4. Write the body

Write the body to a new file under the session's scratchpad directory, or `$TMPDIR` if there is none, never inside the repository. In this shape, in English:

```markdown
**AI critic: passes** (or **AI critic: requests changes**) on <headRefOid>.

<One or two sentences on what the change does and whether it does what card #<id> asks.>

### Findings
1. **Blocking.** `path:line`: what is wrong and why it matters.
2. **Non-blocking.** `path:line`: …

### What was read
<The files read in full, the risky parts read line by line, and what was not read, such as the card when the MCP server was not available.>

This review is the AI critic's, posted as the App. A person still reads the change and decides.
```

## 5. Post it as the App

The verdict follows the findings: `--request-changes` when any finding is blocking, `--approve` otherwise. Post from the repository root:

```sh
pnpm --silent --filter @workbench/api github:review <owner/repo> $pr (--approve | --request-changes) --head <headRefOid> --body-file <file>
```

`GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY_PATH` must be set, as for `github:token`; if they are not, stop and say so. The command is not pre-approved on purpose: posting leaves the machine, so the person sees the verdict and the command before it runs.

If the command answers `refused: the head of pull request … moved`, new commits were pushed while you read. Go back to step 1 once and review the new head; if it moves again, stop and say so. Any other refusal or error: stop and report it as it came.

## 6. Report

Answer with the verdict, the review's URL from the command's output, the commit it is on, and the blocking findings in one line each.
