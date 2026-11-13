
An arcade game is a short practice break inside a lesson: a minute or two of quick decisions about things the lesson has already taught. Every game follows the same rules: a wrong answer shows **why**, the same item comes back later, and the end card lists the learner's own mix-ups.

You do not write game code. You write a **deck**: a small data file with the groups, items and reasons. The kit turns it into a game.

![The menu screen of the Catch game in its ice look: Quill stands on the ice with a basket, and a panel explains which fractions to catch.](media/arcade-catch.png "Catch, ice look. The deck is a list of fractions in groups.")

## The six kinds of game

| The learner must | Game | Looks |
|---|---|---|
| put each thing in one of a few groups | Sort | falling into bins, or a conveyor belt |
| spot the members of one group as they fall | Catch | Quill and fish on the ice, or Quill and mangoes in an orchard |
| answer yes/no questions to reach a group | Route | a runner through gates, or a train at signals |
| match pairs (term and meaning, symbol and unit) | Match | floating bubbles, or a target range |
| put steps or sizes in order | Order | a tower, or a train |
| call statements true or false | Judge | swipe a card, or open a door |

![The menu screen of a Judge game: science claims are shown one at a time, and the learner calls each one a myth or a fact.](media/arcade-judge.png "Judge, with a deck of science myths.")

## Same deck, different games

A deck for Sort lists groups and items:

```js
export const FRACTION_FORMS = {
  groups: [
    { id: 'half', label: '1/2', why: 'top and bottom divide down to 1 and 2' },
    { id: 'quarter', label: '1/4', why: 'top and bottom divide down to 1 and 4' },
  ],
  items: [
    { name: '2/4', is: 'half', why: '2/4: divide top and bottom by 2 -> 1/2' },
    { name: '0.25', is: 'quarter', why: '0.25 is 25 hundredths, 25/100 = 1/4' },
  ],
};
```

The very same deck drives a **Catch** game: a sign shows one group ("Catch 1/2"), and the learner keeps the items that belong and lets the others fall. Using Sort in one lesson and Catch in the next gives variety without any new writing. Quill's Catch on the [welcome page](#/welcome) is exactly this.

> [!TIP]
> Write each `why` as evidence, not as the answer again. "It is high up: its position stores energy" teaches. "It is potential energy" does not.

## When a game is a good idea

Add a game only when all of these are true:

- the lesson has things to remember: terms, groups, symbols, sequences or common myths;
- everything in the deck was taught earlier in the course;
- the tap or catch is the same decision the idea asks for;
- the deck is big and mixed enough that the game is not just memorising one list.

If any of these fail, leave the game out. No game is better than one that does not fit.

## How the kit adds them

In the outline (stage 1b), an arcade slide names its game, look and deck, for example `(ArcadeCatch/ice) deck: fractions`. Stage 2 writes a short plan for it, and stage 3 writes the deck and a few lines of scene. The kit's checks then play the game automatically: one wrong answer, one miss, then a clean run to the end.

Games work with a mouse, a finger or the keyboard: Tab to the game, Enter to start, arrow keys to play, Escape to pause.

## Next

- [Writing a course](writing-a-course)
- [Preview, review and approve](preview-review-approve)
