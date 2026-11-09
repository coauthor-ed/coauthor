---
title: Costs, models and troubleshooting
audience: author
order: 70
summary: What drives the cost of a course, which kind of model suits which stage, and what to do when a run goes wrong.
icon: clock
checkedAgainst:
  kit: 2026-10-14
---

## What drives the cost

AI models charge by the amount of text they read and write. In an agent session, the whole conversation is read again on every turn, so cost grows with **how much the agent reads** times **how many turns it takes**.

The kit is built to keep both small:

- each run does one job, with a fresh memory;
- briefs are short and tell the agent which part of which document to read;
- tools print their own results, so the agent never reads tool code to learn how they work;
- simulations are built in short passes, and the screenshot review is a separate run.

Even so, a full chapter with simulations is many runs. Simulations (stage 3) are usually most of the cost.

> [!TIP]
> Before a long run, check the agent's usage limits. A run that hits a limit halfway wastes what it read. Smaller, more frequent runs are cheaper than one heroic session.

## Which model for which stage

| Stage | What matters most |
|---|---|
| 1a. Source scan | reading images: diagrams, graphs and photos |
| 1b. Outline | teaching judgement: what to ask before what to tell |
| 2. Lesson | clear writing for your reader |
| 3. Simulation | careful coding; a model that follows checks to the end |
| 3-look | reading screenshots |

You can use a different model for each stage. Many people use their strongest model for the outline and a cheaper one for building simulations, with the strong one doing the look run.

## Troubleshooting

**The agent asks me questions instead of working.** Paste the prompt again in a fresh session. The briefs answer most questions; an agent that asks is often one that skipped reading.

**A run stopped halfway.** Run `next.mjs` again. The next run reads the progress notes and continues.

**A simulation is stuck in "building".** Make sure no agent is still working on it, then ask for it again with `--force-scene <name>`.

**Something looks wrong in the preview.** Take a note on that slide and dispatch it as a fix prompt (see [Preview, review and approve](preview-review-approve)). Do not edit generated files by hand unless the change is tiny.

**The doctor reports a problem.** Fix what it names first. `doctor.mjs --selftest` checks that the kit copy itself is sound.

**Where is everything at?**

```bash
node tools/operator/status.mjs --bundle grade9-motion --since 12h
```
