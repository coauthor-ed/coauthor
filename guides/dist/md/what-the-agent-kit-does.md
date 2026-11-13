
The **agent kit** is a folder of instructions, checks and tools that lets an AI coding agent (Claude Code, Codex, opencode and similar) write a CoAuthor course from a textbook chapter. You run the kit; the agent does the writing; you review and approve.

This guide sets expectations before you spend any time or money.

## What it does

- **Reads your chapter.** You give it the chapter as a PDF or text file. It records every figure that matters in a notes file, so later steps never guess at a diagram.
- **Plans the lessons first.** It writes an outline: lessons, slides, which slides need a simulation, which need a question, and why. You can read and change the outline before any lesson exists.
- **Writes one lesson at a time.** Each lesson is a separate run of the agent with a fresh memory, so quality does not drop as the chapter goes on.
- **Builds the simulations.** Each simulation is its own run, with automatic checks (it draws, it comes to rest, its numbers make sense) and screenshots.
- **Checks everything.** Every step ends with a check that must pass: valid files, real answer keys, no slide that depends on something taught later.
- **Shows you everything before your child sees it.** A preview server shows each lesson exactly as a student will see it, with a review panel for notes and approval.

## What it does not do

> [!WARNING]
> There is no single prompt that turns a chapter into a finished course. Anyone who promises that is selling something.

- **It does not decide what your child should learn.** You do. The outline is where you say what matters.
- **It does not replace your review.** An AI can write a confident sentence that is wrong. The kit's checks catch broken files and many factual slips, but you are the one who knows the subject and your child.
- **It is not free to run.** The agent uses an AI model, and a full chapter takes many runs. See [Costs, models and troubleshooting](costs-models-and-troubleshooting).
- **It is not instant.** A chapter is a few evenings of on-and-off work: start a run, review, approve, steer, repeat.

## The method in six steps

1. **Frame** - decide what your child must truly understand by the end.
2. **Spark** - choose what they love (cricket, cooking, music) and check how far the comparison really stretches.
3. **Scaffold** - the kit plans chapters, checkpoints and common mistakes before any prose is written.
4. **Generate** - it writes in small stages, one lesson or one simulation at a time.
5. **Review** - you preview every slide, then approve it or send it back with a note.
6. **Test-teach** - try it with your child, fix what did not land, and share it back.

## Next

- [Setting up the agent kit](setting-up-the-agent-kit)
