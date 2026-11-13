
A descriptive question asks you to write an answer in your own words, like a 2, 3 or 5 mark question in a CBSE exam. CoAuthor checks your answer and helps you improve it. This guide explains how, and you can practise on three real questions below.

> [!QUILL]
> Long answers can feel scary. Here is a secret: an examiner reads them as a short list of points. Get the points right, and the marks follow.

## How your answer is checked

A board examiner marks a long answer as a list of points. A 3 mark answer usually needs three separate points. CoAuthor checks your answer the same way.

1. You write your whole answer in the box.
2. You press **Grade My Answer**.
3. You see a checklist with one line for each point the answer needs:
   - **Nailed it** - your answer makes this point clearly.
   - **Almost** - you are close, but something is missing or unclear.
   - **Missing** - your answer does not make this point yet.

![A graded answer. The checklist shows one point nailed and one point missing, with a Need a hand button next to the missing point.](media/descriptive-checklist.png "One point is there and one is missing. Press Need a hand? next to the missing one.")

The checker reads for meaning, not for exact words. You do not need to copy the textbook. But a point must really be in your answer: a vague sentence that only hints at it is marked **Almost**.

> [!NOTE]
> The checker runs on your own device. The first time you open such a question, it loads for a few seconds ("AI tutor ready"). After that it works offline too.

## Try it: write, then grade

This is a 2 mark question, so it needs two points. Follow these steps:

1. Wait for **AI tutor ready** above the box.
2. Write your answer in one or two sentences. For a first go, write only one point, for example: "Light travels faster than sound."
3. Press **Grade My Answer** and read the checklist.
4. One point is **Missing**. Press **Need a hand?** next to it and follow the clue. (Or press **Start the Build** to fill in just the missing part, blank by blank.)
5. Add the missing point to your answer and press **Grade Again**.

```coauthor-try
{
  "id": "guide-descriptive-lightning",
  "type": "semantic-descriptive@1",
  "prompt": { "en": "During a storm, why do we see the lightning before we hear the thunder? (2 marks)" },
  "rubric": [
    {
      "id": "same-time",
      "label": { "en": "When the flash and the sound are made" },
      "level1": { "en": "Think about when the flash and the sound are made. Is one made earlier than the other?" },
      "clue": { "en": "The flash and the bang come from the same spark, at the same instant. Only their journey to you is different." },
      "level2Template": { "en": "The lightning and the thunder are produced at the ___ time." },
      "accepted": ["same", "same time", "the same time", "same moment", "at once"]
    },
    {
      "id": "light-faster",
      "label": { "en": "Why the flash reaches you first" },
      "level1": { "en": "Both have to travel from the cloud to you. Which one makes the trip faster?" },
      "clue": { "en": "Light covers the distance almost at once. Sound takes about three seconds for every kilometre." },
      "level2Template": { "en": "Light travels much ___ than sound, so the flash reaches us first." },
      "accepted": ["faster", "quicker", "more quickly", "much faster"]
    }
  ],
  "level3": [
    { "eyebrow": { "en": "Point 1" }, "text": { "en": "The lightning and the thunder are produced at the ___ time." }, "rubricId": "same-time" },
    { "eyebrow": { "en": "Point 2" }, "text": { "en": "Light travels much ___ than sound, so the flash reaches us first." }, "rubricId": "light-faster" }
  ]
}
```

> [!QUILL heart]
> Did you see the checklist change after **Grade Again**? That is the habit to build: write, check, fix one point, check again.

## Getting help, one step at a time

If a point is **Almost** or **Missing**, press **Need a hand?** The help comes in steps, from small to big:

1. a short clue about what the point is about;
2. a **stronger clue**;
3. a **bigger hint**;
4. a sentence with one blank to **fill in**;
5. last, a fully worked model answer, built together with you.

Take the smallest help that gets you moving. Then press **Grade Again** to see your checklist change.

## Two kinds of descriptive question

- **Write first.** Most questions in reviews and tests ask for your full answer first. Help comes after you grade it. The lightning question above works like this.
- **Build together.** Some questions in the middle of a lesson go straight to building the answer with you, blank by blank. These come right after a new idea, so you practise writing it while it is fresh.

## Try it: build an answer together

This one is a **build together** question. There is no big empty box. You fill one blank at a time, and each sentence you finish becomes part of the answer.

1. Wait for **AI tutor ready**, then press **Start the Build**.
2. A box shows one sentence with a blank. Type the missing word and press **Check**.
3. Stuck? Press **Hint**. Each hint says a little more.
4. Keep going, one blank at a time, until the whole answer is built.

```coauthor-try
{
  "id": "guide-descriptive-cell-theory",
  "type": "semantic-descriptive@1",
  "mode": "coach",
  "prompt": { "en": "State the three ideas of the cell theory. (3 marks)" },
  "rubric": [
    {
      "id": "all-cells",
      "label": { "en": "What all living things are made of" },
      "level1": { "en": "Plants, animals and tiny living things all share one building block. What is it?" },
      "clue": { "en": "However different they look, every living thing is built from the same basic unit." },
      "level2Template": { "en": "All living things are made of one or more ___." },
      "accepted": ["cells", "cell"]
    },
    {
      "id": "basic-unit",
      "label": { "en": "What a cell is, for a living thing" },
      "level1": { "en": "A cell is the smallest part that is still alive and still does a job. Which word means 'does a job'?" },
      "clue": { "en": "Structure is how something is built. The other word is about how it works." },
      "level2Template": { "en": "The cell is the basic unit of structure and ___ in living things." },
      "accepted": ["function", "functioning", "working"]
    },
    {
      "id": "from-cells",
      "label": { "en": "Where new cells come from" },
      "level1": { "en": "Can a new cell appear from non-living material?" },
      "clue": { "en": "A new cell is made only when an old cell divides." },
      "level2Template": { "en": "New cells are formed only from ___ cells." },
      "accepted": ["existing", "pre-existing", "old", "earlier", "older", "already existing"]
    }
  ],
  "level3": [
    { "eyebrow": { "en": "Setting the scene" }, "text": { "en": "Scientists studied many plants and animals and found three ideas that are true for all of them. Together they are called the cell theory." }, "rubricId": null },
    { "eyebrow": { "en": "First idea" }, "text": { "en": "All living things are made of one or more ___." }, "rubricId": "all-cells" },
    { "eyebrow": { "en": "Second idea" }, "text": { "en": "The cell is the basic unit of structure and ___ in living things." }, "rubricId": "basic-unit" },
    { "eyebrow": { "en": "Third idea" }, "text": { "en": "New cells are formed only from ___ cells." }, "rubricId": "from-cells" }
  ]
}
```

## Writing answers that score full marks

These habits help in CoAuthor and in your board exam:

- **Count the marks.** A 3 mark question needs three clear points. Write each point as its own sentence, or its own line.
- **Start with the point, then explain.** For example: "Power is shared between different organs of government. This prevents any one organ from misusing it."
- **Use the key terms.** If the chapter calls it "separation of powers", use those words.
- **Answer the question that was asked.** "Explain why" needs reasons. "Describe" needs features. "Compare" needs both things in each point.
- **Keep it formal.** Write as you would in the exam, not as you would in a message to a friend.

## Try it: one point in each box

Some questions give you one box for each point. This trains the first habit above: one clear point, in its own sentence.

1. Read the label above each box. It tells you what that point is about.
2. Write one short sentence in each box. Use the key term from the chapter.
3. Press **Check & Submit**.
4. If a point needs work, a hint appears under its box. Fix that box and press **Check & Submit** again.

```coauthor-try
{
  "id": "guide-descriptive-plant-animal",
  "type": "structured-descriptive@1",
  "prompt": { "en": "Give two ways in which a plant cell is different from an animal cell. (2 marks)" },
  "marks": 2,
  "presentationMode": "split-inputs",
  "evaluationMode": "coached",
  "rubricPoints": [
    {
      "id": "wall",
      "weight": 1,
      "uiLabel": { "en": "Difference 1: the outer layer" },
      "keywordPatterns": ["wall"],
      "remedyScaffold": { "prompt": { "en": "Both cells have a cell membrane. A plant cell has one more, stiff layer outside it. What is that layer called?" } }
    },
    {
      "id": "chloroplast",
      "weight": 1,
      "uiLabel": { "en": "Difference 2: making food" },
      "keywordPatterns": ["chloroplast"],
      "remedyScaffold": { "prompt": { "en": "Plant cells make food using sunlight. Which green part inside the cell does this?" } }
    }
  ],
  "explanation": { "en": "A plant cell has a **cell wall** outside its cell membrane; an animal cell does not. A plant cell has **chloroplasts** to make food using sunlight; an animal cell does not. (A third difference: a plant cell usually has one large vacuole, while an animal cell has small ones or none.)" }
}
```

> [!QUILL surprised]
> Notice the hint did not give you the answer. It pointed you at the right idea, and you found the word yourself. That is why it sticks.

## Answers with steps or equations

Some descriptive questions in maths and science ask for a derivation or a proof. For these:

- write **one step on each line**;
- the box has a symbol toolbar for powers, small numbers below the line and other symbols;
- each step is checked as its own point, so a correct step still counts even if a later one goes wrong.

If you write an equation that does not follow from the line above it, the checker shows a note at that step. Look there first.

## Next

- [Practice tests and reviewing your answers](practice-tests-and-review)
