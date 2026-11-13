
A **question bank** is a pool of questions for one chapter, sorted by topic and difficulty. Parents build practice tests from it in the Parent area. A bank is a separate track from the lessons: you can build one with or without lessons for the same chapter.

## The three stages

| Stage | What it writes |
|---|---|
| B1. Plan | `BANK-PLAN.md`: the topics, how many questions each needs, and the mix of question types |
| B2. Questions | the question files, a batch at a time |
| B3. Assemble | the bank file that lists every question with its topic and difficulty, fully validated |

Ask for the next bank prompt the same way as for lessons, with `--bank`:

```bash
node tools/staged-generation/next.mjs --bundle grade9-motion --bank
```

## How many questions

Coverage is planned **per topic**, not per chapter:

- at least **6 questions per topic**;
- a narrow sub-topic can have as few as 4;
- a broad or basic topic deserves 10 or more.

The plan also spreads difficulty (easy, medium, hard) and question types (single choice, numerical answer, typed maths, descriptive answers and more), so a test drawn from the bank feels like a real paper.

> [!NOTE]
> Questions come from the chapter itself, never rewritten from your lesson slides. That way a test checks understanding of the subject, not memory of one slide.

## Hard questions need worked answers

Every question marked **hard** gets a full worked solution, not a one-line explanation, so a child who gets it wrong can learn from it in review. The kit's checks refuse a hard question without one.

## Descriptive questions

For subjects with long answers (history, civics, geography, economics, and proofs in maths), the bank uses descriptive questions marked point by point, like a CBSE marking scheme: a 3 mark question gets 3 points. Your child's view of these is explained in [Answering descriptive questions](answering-descriptive-questions).

## Next

- [Preview, review and approve](preview-review-approve)
