---
title: Writing a course
audience: author
order: 30
summary: The five stages at a glance, how next.mjs hands you one prompt at a time, and how to steer the agent while it works.
icon: pen
checkedAgainst:
  kit: 2026-10-14
---

The kit splits a chapter into many small runs. Each run does one job, writes its result to files, and stops. The next run reads those files with a fresh memory. You do not need to remember where you are: the kit works it out from the files.

## The stages

| Stage | One run per | What it writes |
|---|---|---|
| 1a. Source scan | chapter | `FIGURES.md`: what each figure in the chapter shows |
| 1b. Outline | chapter | `OUTLINE.md`: lessons, slides, and which slides need a simulation or a question |
| 2. Lesson | lesson | the slides, questions and lesson file, plus a short plan ("stub") for each simulation |
| 3. Simulation | simulation | the simulation code, checked and screenshotted |
| 4. Module | chapter | the module file that ties the lessons together; a full validation |

There are also side stages: **R** (a critique of one lesson that only files notes), **5** (the showcase card for the Discover page, after approval) and **B1-B3** (a question bank; see [Building a question bank](building-a-question-bank)).

> [!TIP]
> Read `OUTLINE.md` carefully after stage 1b. It is the cheapest place to change your mind. Moving a slide in the outline costs nothing; rewriting a finished lesson costs a run.

## Getting the next prompt

```bash
node tools/staged-generation/next.mjs --bundle grade9-motion
```

It looks at the files, works out what comes next, and prints one line to paste into a fresh agent session. Run it again after each run finishes.

Useful options:

- `--list` shows every prompt that is ready now, not just one. Lessons and simulations can run side by side in separate sessions.
- `--watch` keeps watching and prints the next prompt when the files change.
- On two machines: `--shard 1/2` on one and `--shard 2/2` on the other.

## Running many at once

If your agent can start helper agents (sub-agents) in one live session, `orchestrate.mjs` prints a block of prompts for it to hand out:

```bash
node tools/staged-generation/orchestrate.mjs --bundle grade9-motion
```

## Steering while it works

You can leave directions for a bundle, a lesson, a slide or a single simulation, even one that only exists in the outline so far. The next run for that unit reads them first.

- In the dashboard (see [Preview, review and approve](preview-review-approve)): **Steer generation**.
- Or from the command line:

```bash
node tools/operator/notes.mjs --direct L02/RampScene "Use a cricket ball, not a box." --stage 3
```

## Simulations are the expensive part

Stage 3 runs are the longest. Two settings save a lot:

- **Manual review**: `next.mjs --review manual`. The agent builds and checks the simulation but does not run its tests; you run them from the dashboard and mark it reviewed.
- **Look later** (on by default): the building run skips screenshots, and a separate, cheaper run with an image-reading model looks at them afterwards. `--no-split-look` turns this off.

## When a run dies

Runs sometimes stop halfway (a usage limit, a network error). Just ask `next.mjs` again. A simulation's design note records its progress, so the next run picks up where the last one stopped instead of starting over.

## Next

- [Preview, review and approve](preview-review-approve)
