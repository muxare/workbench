---
name: work-batch
description: Work a batch of cards handed to the AI on the workbench board. Plan the batch into waves that can run side by side, post the plan, work each wave with one worktree subagent per card, have each finished branch reviewed by fresh eyes, and stop before any push or pull request. Use when Mikael types /work-batch, with or without a batch id.
argument-hint: "[batch-id]"
arguments: [batch]
disable-model-invocation: true
allowed-tools: mcp__workbench__list_batches mcp__workbench__get_batch mcp__workbench__list_cards mcp__workbench__get_card Bash(git log *) Bash(git diff *) Bash(git show *) Bash(git rev-parse *) Bash(git merge-base *) Read Grep Glob
---

# Work a batch of cards

A batch is several Ready cards a person handed to the AI as one unit (stage 3b in `docs/dev-loop.md`). This skill decides the order and what runs together; each card is still picked, asked about, worked and reviewed exactly as a single card is in stage 3. It runs in the main session, not in a fork, because it starts subagents of its own.

Batch id given: `$batch` (blank means none). Nothing is pushed and no pull request is opened until Mikael says so.

## 1. Find the batch and read it

If no id was given, call `list_batches` with state `handed` and take the first, which is the oldest; if there is none, say so and stop. Read the batch with `get_batch`: each card, its function, its `depends_on` links and its status. Run `git fetch origin` and compare `git rev-parse main` with `git rev-parse origin/main`; if they differ, say so and stop, because the waves must start from what is on GitHub. That commit is the base every card of the first wave branches from.

If the batch already has a plan, keep it and go to step 3; a plan cannot be posted twice. Skip every card that is in Review or Done or already has a branch with commits of its own, and start at the first wave that holds a card not yet worked, with the last finished branch of the plan as its base.

## 2. Plan the waves and post them

One rule is hard: a card goes in a later wave than every card in the batch it depends on. The rest is judgement about overlap. For each card, read its title, its function and the code it will touch, and write down the files it is likely to change: the route module, the screen, the shared types, the event mapping. Two cards that are likely to change the same files go in different waves, because parallel branches that touch the same lines turn the merge into the work. Otherwise prefer fewer, wider waves.

Give every wave a `note` that says why its cards are together and, where it applies, why a card waits for an earlier wave, naming the dependency or the shared file. Post the plan with `plan_batch`. If the board refuses it, read the reason, fix the plan and post again; do not drop a card to make the plan pass.

## 3. Work a wave

For the wave, start one subagent per card with `isolation: "worktree"`, at most three at a time, all in one message so they run in parallel; a wave of more than three runs in groups of three. Before starting them, call `link_branch` for each card to learn its branch name. Each subagent sees nothing but its brief, so the brief must stand on its own. Give it:

- the card id and the repository, and the instruction to read `AGENTS.md` and the card with `get_card` first;
- the first command to run, `git switch -c <branch> <base sha>`, because a worktree can start from a stale commit, then `pnpm install --frozen-lockfile`, because a new worktree has no `node_modules`;
- that it picks its own card with `pick_card`, and that a refusal means it reports the refusal and stops, changing nothing;
- that it works within the `what_the_ai_does` the pick returns, and when something only a person can settle blocks it, asks on the card with `ask_question` and waits with `wait_for_answer`, rather than guessing;
- that it follows `AGENTS.md`, and `pnpm check` passes before it hands back; it cannot start subagents of its own, so it does not run `design-reviewer` itself;
- that it commits on its branch and does not push, open a pull request or call `post_report`;
- that it reports its branch, its worktree path, its head sha, the result of `pnpm check`, whether it changed anything under `apps/web` and which screens, and anything left open.

A card in `assist` mode that waits on an answer blocks only its own subagent. Wait for every subagent of the wave before step 4.

## 4. Review, combine and report between waves

For each finished branch, start a review subagent that has not seen the code or this conversation, in parallel for the wave. Give it the card id, the branch and the wave's base sha, and have it read `git diff <base>..<branch>` and the card, judge the change by `.claude/skills/review-pull-request/checks.md`, and return its findings. Tell it that it is read-only: it posts nothing and calls no workbench tool, whatever `checks.md` says about how a verdict is recorded. For a branch that changed a screen in `apps/web`, start the `design-reviewer` subagent on that screen and its artboard alongside the review. Fix each blocking finding and design mismatch, and each non-blocking finding that is cheap, in that card's worktree, commit, and run `pnpm check` there again; answer the rest in the report.

Then stack the wave into the next wave's base. Take the wave's branches in plan order and leave the first as it is. Rebase each later branch k onto the one before it with `git -C <worktree k> rebase <branch k-1>`, naming the earlier branch by name, in card k's own worktree, since a branch checked out in a worktree cannot be rebased from elsewhere. A conflict that is mechanical, resolve; one that needs a choice, ask on the card. The last branch is the next wave's base, so every card of the next wave starts from a commit that holds every card it depends on and every card it was kept apart from.

Then check the stack. For each branch k after the first, `git merge-base --is-ancestor <branch k-1> <branch k>` must succeed. Run `pnpm check` in the last card's worktree, which holds the whole stack.

Post a report on each card with `post_report`: what was done, the branch and sha, the check result, the review's findings and what was done about them, and what a person should read first. Then go back to step 3 with the next wave.

## 5. Report and stop

When the last wave is done, answer with one line per card: its branch, its head sha, the review's verdict and the `pnpm check` result, and anything still open. Say that after stacking only the tip was checked, and that each pull request's CI checks its branch on its own. Then stop and wait for Mikael's go-ahead. Do not push or open a pull request without it.

With the go-ahead, push the branches and open the pull requests in plan order, as `link_branch` says under `how`: push as the workbench App with a token from `pnpm --filter @workbench/api github:token <owner/repo>`, and put the line `Workbench: #<id>` in each body. Since each branch holds the ones before it, open the first pull request against `main` and each later one with `--base <previous branch>`, so that GitHub retargets it to `main` when the earlier one merges. Opening the pull request is what moves a card to Review, and the batch is finished once every card is in Review or Done.
