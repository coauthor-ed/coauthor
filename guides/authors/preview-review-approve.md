---
title: Preview, review and approve
audience: author
order: 50
summary: See every lesson as your child will, take notes, approve what is ready, and turn notes into fix prompts.
icon: check
checkedAgainst:
  kit: 2026-10-14
---

Nothing reaches your child until you approve it. This guide shows the review loop: preview, note, fix, approve.

## Start the preview

```bash
node tools/operator/preview.mjs
```

It starts a small server (and the CoAuthor app, if it cannot find one) and prints links to each lesson, plus a QR code and a pairing code so you can open the preview on a phone or tablet on the same Wi-Fi.

The **dashboard** at `<preview address>/dashboard.html` lists every lesson and simulation with its state.

> [!TIP]
> Review on the device your child will actually use. A slide that looks fine on a laptop can be cramped on a phone.

## The review panel

Each lesson preview has a review panel. You can drag it by its handle, dock it at the top or bottom, or collapse it.

From the panel you can:

- **take a note** on a slide (a bug, a wrong fact, a wording change, an idea);
- **approve** the slide or the whole lesson;
- **Run tests** for a simulation, and add any failures as notes.

For a quick look at a whole lesson at once, make a contact sheet: screenshots of every step.

```bash
node tools/operator/contact-sheet.mjs --bundle grade9-motion --lesson L02
```

## Turning notes into fixes

Notes become prompts for the agent:

- In the panel or the dashboard, choose **Copy fix prompt** and paste it into a fresh agent session.
- After pasting, choose **Mark these done** beside it. That closes exactly the notes that prompt held.

Only **accepted** notes go into a fix prompt. Your own notes start accepted. Notes written by a model (for example by a stage R critique) wait until you press **Accept**.

## Approving

Approve from the panel, or from the command line for bigger scopes:

```bash
node tools/operator/approve.mjs --bundle grade9-motion --lesson L01 --yes
```

Without `--yes` it only shows what it would approve. Approved content stays approved when you edit it later; use `unapprove.mjs` with the same options to take approval back.

## A sensible order

1. Read the outline before any lesson exists.
2. Review each lesson as soon as it is written, before its simulations are built. Wording fixes are cheap then.
3. Review the simulations in the lesson preview, where they appear with their slides.
4. Try the lesson with your child. Note where they got stuck.
5. Approve, then publish (see [Publishing your course](publishing-your-course)).
