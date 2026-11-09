---
title: Setting up the agent kit
audience: author
order: 20
summary: Make a workspace from the kit, choose an agent, add your first chapter, and check that everything is healthy.
icon: sliders
checkedAgainst:
  kit: 2026-10-14
---

This guide takes you from nothing to the first prompt you paste into an agent. It takes about fifteen minutes.

## What you need

- **Node.js 20** or newer.
- **An AI coding agent** that can read and write files in a folder and run commands: for example Claude Code, Codex CLI or opencode. A model that can look at images helps with diagrams and screenshots.
- **The chapter** you want to turn into a course, as a PDF or a text file.
- For reading PDFs: the `pdftotext` and `pdftoppm` tools (the `poppler-utils` package on Linux, `poppler` on macOS with Homebrew).
- **Playwright** with Chromium, for simulation checks and screenshots: `npm install -g playwright` then `npx playwright install chromium`.

## 1. Make a workspace

A workspace is your own folder (usually a git repository) where the courses live. The kit copies its files into it.

```bash
node tools/operator/start.mjs --from <kit folder or git url> --into ~/courses-work
```

Run this from a copy of the kit (the `content-repo-template` folder of the CoAuthor repository). It asks you for:

- a **bundle id** - a short name for the course, such as `grade9-motion`;
- the **chapter file**;
- the **subject** and **grade**;
- whether the agent may **search the web** (off by default; see below).

At the end it prints the first prompt for your agent.

> [!TIP]
> To add another chapter later, run `start.mjs` again inside the same workspace. Each chapter becomes its own bundle under `courses/`.

## 2. Check that everything is healthy

```bash
node tools/operator/doctor.mjs
```

The doctor checks your Node version, the kit version, the tools above, and that your bundles are valid. Fix anything it marks as a problem before you start. To test a kit copy fully, add `--selftest`: it validates the example course and runs one example simulation check.

## 3. Choose your agent

Open your agent **in the workspace folder**. The kit's `AGENTS.md` and `CLAUDE.md` tell the agent the house rules, so you do not need to explain them.

A few things that help:

- Start every run in a **fresh session**. The kit is designed so each run starts with no memory; old conversation only costs money.
- Let the agent run commands without asking for each one, if your agent allows it. The kit's tools are safe to run.
- Keep web search **off** unless you need it. The kit works from your chapter, so facts come from your source, not from random websites. To allow it: `node tools/operator/web-mode.mjs on`.

## 4. Paste the first prompt

The first prompt looks like this:

```text
Read START-HERE.md and follow it. Stage: 1a. Bundle: grade9-motion. Target: FIGURES.md.
```

Paste it into the agent and let it work. When it finishes, it writes a short report. Then you ask the kit for the next prompt. [Writing a course](writing-a-course) explains the stages.

## Next

- [Writing a course](writing-a-course)
