# Content Authoring Guide

This document defines the JSON conventions for all content in the CoAuthor. Following these rules strictly is required for the content validators (`/tools/validation/{lesson,question,bank}.js`) and the content loader to process files correctly. 

## Core Design Principles

Content is authored for machines first, rendered for humans second. To ensure AI-generability and reliable human review:

1.  Flat over nested: Prefer arrays of small flat objects over deep trees.
2.  Enums over free text: Any field with a closed set of values (difficulty, subject, board) must use strict enums.
3.  Explicit IDs everywhere: Never use positional or implicit references. A question always references its chapterId and topicId explicitly.
4.  One concept per file: One question = one JSON file. One lesson = one JSON file referencing block files by ID.
5.  Self-describing type + version: Every content unit must declare its type as "name@version" (e.g., "mcq-single@2").

## Directory Layout

All content lives under the `/content/` directory:

```
/content
  /curriculum.json                # The canonical map: subject → chapter → topic
  /subjects.json                  # Registry of subject codes
  /courses/                       # Self-contained course bundles (local dev/test fixtures — the
                                   # runtime discovers real courses via CourseSourceManager, not this
                                   # path)
    /<course-bundle>/             # e.g., ramesh-biology-grade9
      /modules/                   # Module manifests (composes lessons/questions)
      /lessons/                   # Lesson manifests and slides
      /questions/                 # Question JSON files (MCQs, numerics, descriptive, etc.)
      /tests/                     # Test definitions and question banks
      /media/ (or /assets/)       # Image and media assets co-located with course
```

## Localization (i18n)

Every learner-facing text field in content JSON must be an object keyed by language code, even though only en is populated in v1. 

Exception: `"_comment"` (any object level - item, part, block) is a plain-string note for authors and tools. It is never rendered, never localised, and ignored by the engine and validators. Its `.md` counterpart is a stand-alone `<!-- AUTHOR NOTE: ... -->` comment, which `splitSteps` drops so it never costs a beat.

Correct:
```json
"stem": { "en": "What is the speed of light?" }
```

Incorrect:
```json
"stem": "What is the speed of light?"
```

## The Curriculum Map (`curriculum.json`)

This file is the canonical tree. Every chapterId and topicId used in any content file must resolve to an entry here.

- id values are kebab-case and globally unique within their level, with one deviation: subject ids are snake_case (e.g. `business_studies`), matching their existing use as course-folder-name components.
- grade lives on the chapter, not the subject.

```json
{
  "board": "CBSE",
  "subjects": [
    {
      "id": "physics",
      "name": { "en": "Physics" },
      "grades": [11, 12],
      "chapters": [
        {
          "id": "motion-in-a-straight-line",
          "grade": 11,
          "name": { "en": "Motion in a Straight Line" },
          "order": 1,
          "topics": [
            { "id": "average-velocity", "name": { "en": "Average Velocity" }, "order": 1 }
          ]
        }
      ]
    }
  ]
}
```

## Lessons & Blocks

Lessons hold ordering and metadata only; they reference block files by ID + path. They never inline block payloads. Lessons can be strictly linear (using a `blocks` array) or branching (using a `flow` graph and `flowStart` node).

### Path convention: bundle-relative, not absolute

Every ref field a bundle's own files use to reference each other — a lesson's `blockRef`, a module's `lessonRef`, a test's question `ref`, an `image.src`/`srcDark`, a `simulation.src` — is written **relative to that bundle's own `manifest.json`**, not as a root-absolute `/content/courses/<bundle>/...` string. Write `"blockRef": "blocks/L01/blk-001.json"`, not `"blockRef": "/content/courses/my-bundle/blocks/L01/blk-001.json"`. This is what lets a bundle folder be renamed, moved, or copied elsewhere without any file inside it needing to change — see `src/core/CourseSourceManager.js`'s `resolveRef()` for exactly how the runtime resolves these. A full `http(s)://` URL is also valid wherever a ref is accepted (used as-is, for a genuinely externally-hosted asset). The legacy root-absolute form still works — the engine keeps resolving it exactly as before — but new content should never use it.

### Topic tagging cardinality

Topic tagging cardinality differs by level, because a module is expected to mirror a full NCERT chapter (so an author can follow the same syllabus structure) while a lesson is one pedagogical slice of it:

- **Module**: `topicIds` (array) — typically the full topic list of the chapter it covers.
- **Lesson**: `topicIds` (array) — zero or more of its parent module's topics; a lesson usually covers a subset, not the whole chapter. (Older content may still have a legacy singular `topicId` field — treat it as a one-item array; new/edited lessons should use `topicIds`.)
- **Block/Question (a single slide)**: `topicId` (singular) — exactly one topic, since a slide is atomic.

A module may carry an optional top-level `"lessonMode": "story"` to mark a **story-only module**: the engine forces Story mode there and hides the Classic/Story switch (the learner's saved choice is untouched). Omit it for a module that works in both modes; `"story"` is the only legal value, anything else is a validator error (`tools/validation/module.js`).

A module may also carry an optional top-level `"look": "<id>"` naming an entry in the engine's `registry/looks.json` (`"quill"`, the default, or `"plain"`). While the module is open, its dashboard and lessons use that look instead of the site's (`site.json`); leaving the module restores the site look. Omit it to follow the site. An id the registry does not know falls back to the default with a console warning. The look also decides which lesson modes exist: a look offering only Classic overrides `"lessonMode": "story"`.

A course bundle's `manifest.json` may carry an optional `"simSetting"`: the world painted behind its scenes. Accepted: `sky` (default), `lab`, `water`, `field`, `parchment`, `riso`, `none`. Maths courses keep graph paper regardless.

A module may also carry an optional top-level `"gamification": true|false`. While the module is open it decides whether XP, streaks, stars and similar show, over `site.json`'s `gamification` and the look's default; the course's tests follow its first module. Omit it to follow them. Only display changes: XP and streaks are always recorded, and anything else is a validator error. Plain progress (lesson X of Y, percent complete, scores) always shows.

Because cardinality differs, a parent's topics are never blindly copied onto its children wholesale. The authoring app's "Push Tags to Children" action only *seeds* a child's topics when it has none yet (an editable starting point), and never overwrites a child that already has topics assigned.

**Linear Lesson Example:**
```json
{
  "id": "phy11-motion-lesson-01",
  "subject": "physics",
  "grade": 11,
  "chapterId": "motion-in-a-straight-line",
  "topicIds": ["average-velocity"],
  "title": { "en": "Understanding Average Velocity" },
  "estMinutes": 12,
  "blocks": [
    { "id": "blk-phy11-motion-001", "ref": "blocks/blk-phy11-motion-001.json" }
  ],
  "authoring": { "status": "human-approved", "reviewedBy": "j.mehta", "reviewedAt": "2026-05-10" }
}
```

**Branching Flow Lesson Example:**
```json
{
  "lessonId": "quad-eq-factoring-explore",
  "topicIds": ["quadratic-equations-factoring"],
  "title": { "en": "Solving by Factoring — Explore the Steps" },
  "flowStart": "step0",
  "flow": {
    "step0": { "block": "qeq-b001-intro", "next": "step1" },
    "step1": { "block": "qeq-decision-1", "next": { "correct-standard-form": "step2", "alt-formula-method": "alt-step2a" } }
  }
}
```

### Block File (`/content/blocks/...`)

Real content uses a flat envelope — fields sit directly on the block object, not nested under a `data` key:

```json
{
  "id": "blk-phy11-motion-001",
  "type": "poe-predict@1",
  "prompt": "A ball is thrown straight up. At the very top of its path, what is its velocity?",
  "options": [
    { "id": "a", "text": "Zero" },
    { "id": "b", "text": "Equal to launch speed, downward" }
  ],
  "correctOptionId": "a",
  "deferVerdict": true
}
```

A `poe-predict@1` (or question) may carry `"simulation": { "src": "...", "role": "setup" }`: the scene mounts immediately beside the prompt (a snapshot to predict from). Without `role: "setup"` the scene appears only after the learner answers.

`content-block@1.simulation.position` is `"right"` (default) | `"left"` | `"above"` | `"below"` | `"flow"` — see `blockLayoutClass()`/`resolveSimLayout()` (`src/core/components/blockImageLayout.js`) for the full adaptive-layout chain. `"below"` (or `"above"`) may add `"fullWidth": true` for a slide whose simulation IS the content, with only a short line or two of markdown alongside it rather than progressive-disclosure beats (a mini-game with no side text competing for room, e.g. a real-time arcade game) — it renders the scene at up to ~1400px instead of the shared 820px `above`/`below` cap. A scene opting into this should declare a properly widescreen `static WIDTH`/`HEIGHT` (e.g. 960x540, not the common ~620x520): `fullWidth` renders at that width regardless of the resulting height, so a near-square design ends up unnecessarily tall.

`content-block@1.simulation` may also carry optional `title` and `caption`, each `{ "en": "..." }` (a plain string is tolerated at runtime): the engine renders `title` as a head strip above the simulation frame and `caption` as a line below it. Anything other than an `{en}` object or a string is a validator error (`tools/validation/block.js`).

`content-block@1.simulation` may also carry an optional `focus` map for Story's diorama camera (`src/core/components/diorama/`): `"focus": { "<step id or 1-based beat number>": { "x": 0.6, "y": 0.1, "w": 0.3, "h": 0.25, "label": "the nucleus" } }`. Rects are fractions (0..1) of the scene's own design size. On that beat, with the learner's "Camera follows the beat" option on, the stage zooms to the rect and its chip reads "Looking at <label>"; a beat with no entry shows the whole scene. Keys are a `<!-- STEP id="..." -->` id (stable) or the beat's number as a string (`"2"`: simpler, but it shifts if beats are added). A scene can supply the same thing itself with an optional `beatFocus(step, stepCount)` method returning such a rect (or null), which wins over the JSON. Story only; Classic ignores it.

`deferVerdict: true` means this block only acknowledges "prediction saved" — it does not say whether the student got it right. The verdict is shown instead by whichever block is tagged `poeRole` and sits *immediately* after this one in the lesson's `blocks` sequence:

```json
{
  "id": "blk-phy11-motion-002",
  "type": "content-block@1",
  "markdown": { "en": "The ball hangs in the air for an instant before falling back — its velocity really was zero at the top." },
  "poeRole": "observe"
}
```

`poeRole` is `"observe"` or `"explain"`. Both fields can be set by a converter from the source lesson markdown's `[observe]`/`[explain]`/`[predict]` slide roles, or by hand, via the "POE Role" selector (content-block editor) / "Defer verdict to next block" checkbox (POE-Predict editor) in the authoring app. See `src/engines/lesson/POEController.js` for the runtime hand-off.

### Progressive disclosure, color-coded math, and the "result" callout

`content-block@1.markdown` (and any future block type mixing in
`ProgressiveDisclosureMixin`) reveals one beat at a time rather than all at
once — by default, split automatically from the markdown's own structure
(headings, list boundaries, etc). For a math-heavy slide, take explicit
control instead by adding `<!-- STEP -->` sentinels: one HTML comment
anywhere in the body switches the whole block to authored mode, and every
sentinel from then on marks where the next beat begins.

```
# Proving the wobbly path equality

<!-- STEP id="setup" -->
Let the radii of semicircles $a, b, c, d$ be $r_a, r_b, r_c, r_d$.

<!-- STEP id="result" callout="result" line="Multiply by pi, and both paths match exactly." -->
Multiply both sides by $\pi$: $\pi r_a = \pi(r_b + r_c + r_d)$.

**The two paths are always identical in length.**
```

A sentinel takes three optional attributes, in this order — `id`, then
`callout`, then `line`:

- **`id`** — a stable name for the beat, used by `reveal.focus`/
  `reveal.images` (below) to key per-beat overrides.
- **`callout="result"`** — marks the beat that follows as the slide's
  payoff. It renders in a named box (background panel, colored left border)
  that — unlike an ordinary beat — never dims once the student moves past
  it, with a small `<quill-mascot>` reacting once when that beat becomes
  current. Use it for the one sentence a proof/derivation slide is actually
  building toward, not for every beat.
- **`line`** — the short line Quill speaks when the `callout="result"` beat
  becomes current. Omit it for a silent reaction (no speech bubble).

Splitting a derivation into beats this way is the single biggest lever for
making it feel less like a wall of symbols — a student taps through one
algebraic step at a time instead of receiving the whole proof at once.

**Color-coding math.** A block-level `mathColors` field maps a LaTeX
variable to a CSS color value, applied to every equation in the block
(every beat, not just one):

```json
{
  "type": "content-block@1",
  "markdown": { "en": "..." },
  "mathColors": {
    "a": "var(--sim-series-1-ink)",
    "b": "var(--sim-series-2-ink)",
    "c": "var(--sim-series-2-ink)",
    "d": "var(--sim-series-2-ink)"
  }
}
```

A key matches the variable wherever it appears in any `$...$`/`$$...$$`
expression in the block — bare (`$a$`) or as a subscript (`$r_a$`, which
colors just the "a", not the whole "r_a" term). Group variables under the
same color when they play the same role in the argument (here, the three
small semicircles b/c/d are interchangeable, so they share one color;
`a`, the single large semicircle, gets its own) — this mirrors, and should
generally *reuse*, whatever color roles a diagram or simulation above the
slide already assigned to the same labels via `--sim-series-N`
(`src/simulations/base/sim-theme.css`). **Values must always be a
`var(--sim-*)` (or other real design) token, never a literal hex** —
invariant 9 applies to content JSON exactly as it does to engine/simulation
code.

**Always use the `-ink` suffix (`--sim-series-N-ink`), never the bare
`--sim-series-N`, for `mathColors`.** The bare series tokens were validated
as canvas *shape fills*, which lean on a shape's own dark outline for
legibility and tolerate lower contrast than text does. Several fail WCAG AA
(<4.5:1) as thin math glyphs on `--bg-panel` in light theme — e.g.
`--sim-series-2` measures 2.84:1 there. The `-ink` variants are the same
hue, darkened just enough in light theme to clear 4.5:1 (identical to the
bare token in dark theme, which already passes). If a diagram assigns a
part `--sim-series-4`, color that part's variable with
`var(--sim-series-4-ink)`, not `var(--sim-series-4)` — same color family,
legible either way. See `src/core/markdown/mathColorize.js` for the
matching rules and `sim-theme.css`'s own doc comment on the `-ink` block
for the measured contrast ratios.

### Prose in a sibling `.md` file

`content-block@1.markdown`, `poe-explain@1.prompt`, and `poe-observe-sim@1.prompt` (all `{en:...}`) may instead be authored as `markdownRef`/`promptRef` — a path to a sibling `.md` file, resolved the same bundle-relative way as `image.src`/`simulation.src` (`CourseSourceManager.resolveRef()`, anchored at the bundle root, not the referencing file). `poe-predict@1.prompt` has the same `promptRef` alternative, but its inline shape is a bare string, not `{en:...}` — `hydrateProseRefs.js` (`src/core/hydrateProseRefs.js`) produces the shape each plugin already expects, per field. Inline and ref are mutually exclusive; inline wins if a block somehow carries both, and a course repo's validator fails that case. Existing inline content keeps working untouched — this is the preferred form for new authoring, not a migration.

```json
{
  "id": "blk-phy11-motion-003",
  "type": "content-block@1",
  "markdownRef": "blocks/L01/blk-phy11-motion-003.md"
}
```

### Glossary (tap-to-gloss) - `glossary.json`

A bundle may ship an optional `glossary.json` at its root (the manifest generators list it as `glossary`). Its terms are marked with a dotted underline in lesson beats (`content-block@1`, `poe-explain@1`, `poe-predict@1`) and open a card with the plain name, word pieces, meaning and, if given, a character face. Questions and tests are never marked. `src/core/GlossaryService.js` loads it once per bundle; `<markdown-renderer glossaryBundle>` marks the words; `<glossary-popover>` shows the card. The same data feeds `simulations/base/kit/NameDecoderScene.js` through `config.glossaryTerm(id)` (supplied by `content-block`).

### Narration (`narrationRef`) - audio-led playback

A lesson may carry an optional `narrationRef`: a bundle-relative path to a `coauthor-narration@1` sidecar (built by a separate narration build tool). When it is present the lesson shows a **Narrate** toggle; when absent nothing changes.

```json
{ "id": "les-01", "narrationRef": "narration/les-01.narration.json", "blocks": [ ... ] }
```

- **One lesson, one cursor.** Narrated mode is not a second renderer. `src/engines/lesson/NarrationPacer.js` drives the existing `LessonEngine` cursor (step reveal, `next`, `seekTo`); switching Narrate on/off never remounts a block and keeps the exact block and beat. On a slide with a picture the prose is hidden while narrated and shown as captions instead; on a text-only slide the prose stays and the spoken word is lit in place (CSS Custom Highlight API; no caption).
- **Segment lookup.** A segment is matched to a beat by `{block, step}` where `step` is the authored `<!-- STEP id="x" -->` id, else `b<N>` (1-based derived beat); then by `beat` number; question blocks use `step: "prompt"`. `block` is the block's `id` (or the ref's file name).
- **Missing segment = timed read.** A beat with no segment (or whose audio fails to load) is captioned and held for `words / 3` seconds (min 1.5 s) at the chosen speed.
- **`await`.** `"answer"` holds until the learner answers the block (`question:graded` / POE prediction), then advances after a short dwell. `"interact"` holds until the scene reports completion (`cue:found` / `cue:game-solved`); the learner can also press Continue. A question block always waits for an answer.
- **Cues.** `cues: [{id, char, t}]` fire at time `t` and call the scene's `onCue(id)`, the same hook `<!-- CUE:id -->` anchors use in text mode (in narrated mode the anchor observer is off, so a cue fires once, from audio time).
- **Captions.** `words: [[startMs, endMs, charOffset]]` drive word highlighting (static highlight under `prefers-reduced-motion`). Optional `lines: [[startChar, endChar]]` sets caption phrase breaks; else phrases break at sentence/comma ends. Captions sit in the scene's `freeRect()` if it returns one, else the letterbox band, else above the scene on a portrait phone. On a question they sit below the block if that fits, else at the top over the stem, and disappear while it waits for the answer.
- **Streaming.** MP3s are fetched on demand, never precached. The service worker keeps a same-origin audio file once it has been played (cache-on-play) and answers range requests from that copy as `206`, so seeking and offline replay work; cross-origin audio passes straight to the network. Keep them small (mono 48 kbps).
- **Known gaps.** Flow-mode (`flowStart`) lessons, the POE recap step and captions in a fullscreen scene are not narrated specially yet.
- **Validation.** `tools/validation/lesson.js` checks `narrationRef` is a `.json` path; `validateNarrationSidecar()` checks sidecar shape. Stale audio (text changed since build) is flagged by that tool's check.

Optional scene hooks (all feature-detected; a scene without them still narrates):

| Hook | Called when |
|---|---|
| `onCue(id)` | a sidecar cue (or text-mode CUE anchor) fires |
| `onBeatChange(step, stepCount)` | the beat changes (existing hook) |
| `static SEEKABLE = true` + `seek(beat, ms)` | every tick and on scrub, so a scene can follow audio time |
| `getState()` / `setState(s)` | narrated remount of a block restores scene state |
| `freeRect()` | returns `{x, y, w, h}` fractions (0..1) of empty canvas where captions may sit, or `null` |

## Questions

Questions are standalone JSON files. All question types share base metadata fields.

### Base Question Metadata

```json
{
  "id": "phy11-motion-q0042",
  "type": "mcq-single@2",
  "subject": "physics",
  "grade": 11,
  "chapterId": "motion-in-a-straight-line",
  "topicId": "average-velocity",
  "difficulty": "medium",
  "bloomLevel": "apply",
  "board": "CBSE",
  "tags": ["kinematics", "average-velocity"],
  "estTimeSec": 60,
  "authoring": {
    "status": "ai-draft",
    "model": "claude-sonnet-5",
    "reviewedBy": null,
    "reviewedAt": null
  }
}
```

### Explanations backed by real slides

`explanation` ({en}) is the short, always-shown one-line takeaway, rendered by the shared `<question-explanation>` component (`src/core/components/QuestionExplanation.js`) once the question is revealed. For a question that needs a real worked solution rather than one line, add `explanationSlide` alongside it — a simulation still only *labels* (project rule), it never explains; this is where the explanation itself lives instead:

```json
"explanation": { "en": "Work done is force times displacement in the force's own direction." },
"explanationSlide": {
  "presentation": "inline",
  "blocks": [
    { "blockRef": "explanations/L02/exp-q-l02-s01.json" },
    { "blockRef": "explanations/L02/exp-q-l02-s02.json" }
  ]
}
```

The referenced files are ordinary `content-block@1` blocks (so `markdownRef` and `simulation` both work on them normally), living under `explanations/L0N/` — deliberately not `blocks/L0N/`, so "not part of the lesson's own flow" is visible in the filesystem. Nothing scans directories at runtime; a block only reachable via `explanationSlide.blocks[]` stays out of the lesson's own progress count, and the kit validator's orphan check knows to treat it as referenced, not dead. `presentation`: `"inline"` (default) renders the blocks behind a disclosure in the feedback area; `"slide"` opens a full overlay with Prev/Next, for a multi-block worked solution. Loaded lazily, on first reveal — an unanswered question never fetches its explanation slides.

#### Type: `mcq-single@2`

Standard multiple-choice question.

```json
{
  "stem": { "en": "A car travels 60 km in the first hour and 40 km in the next hour. What is its average velocity?" },
  "options": [
    { "id": "a", "text": { "en": "50 km/h" } },
    { "id": "b", "text": { "en": "100 km/h" } }
  ],
  "correctOptionId": "a",
  "hints": [
    { "en": "Average velocity = total displacement / total time." }
  ],
  "explanation": { "en": "100 km / 2 h = 50 km/h." }
}
```

`options[]` are shuffled for display by default (`shuffle: true` unless explicitly set to `false` — `src/plugins/questions/mcq-single/v2/index.js`'s `init()`), while `correctOptionId` and scoring always key off each option's own `id`, in authored order — so shuffling never affects correctness. It does mean `explanation`/`hints` text must **never refer to an option by letter or position** ("option b", "the second choice", "c and d both miscalculate...") — whatever a student sees on screen may not be in authored order at all, and the UI never shows an A/B/C/D letter anyway. Refer to an option by quoting or describing its actual content instead (e.g. "assuming `(a + b)^3 = a^3 + b^3` gives 90, not 35" rather than "option c mistakenly assumes..."). For feedback that's genuinely specific to one wrong option, use that option's own `feedback` field (`{ "id": "b", "text": {...}, "feedback": { "en": "..." } }`) instead of naming it in `explanation` — `feedback` is keyed by `id`, so it's shuffle-safe by construction. (`assertion-reason@1` below is the one exception where letter references in `optionFeedback`/`explanation` are safe — its options are never shuffled.)

#### Type: `assertion-reason@1`

CBSE-style Assertion/Reason question. Subclasses `mcq-single@2` (`src/plugins/questions/assertion-reason/v1/index.js`)
to reuse its scoring/feedback/companion-field support — only `assertion`/`reason` replace `stem`, and the option
text is never authored: it's the fixed CBSE wording, picked by `optionSet` (`"standard4"` default, or
`"standard5"` to add a "both false" option), keyed `a`–`d`(`e`). Options are never shuffled. `explanation` always
shows once revealed, regardless of correctness; `optionFeedback` is optional and lets each wrong letter surface
its own specific misconception in the feedback banner instead of a generic "Incorrect." — any letter you don't
key falls back to that generic message.

```json
{
  "assertion": { "en": "Metals conduct electricity." },
  "reason": { "en": "Metals have free electrons that can move through the lattice." },
  "correctOptionId": "a",
  "optionFeedback": {
    "b": { "en": "Both statements are true here — look again at whether R actually explains A." },
    "c": { "en": "Reason (R) is true, not false — metals really do have free electrons." },
    "d": { "en": "Assertion (A) is true, not false — metals do conduct electricity." }
  },
  "explanation": { "en": "R correctly explains A: it's exactly the free (delocalized) electrons that carry current." }
}
```

#### Type: `numeric-value@1`

Numeric-answer question. The runtime plugin (`src/plugins/questions/numeric-value/v1/index.js`) accepts a flat
`expectedValue`/`tolerance`/`unit` shape — there is no variable/formula/template parametrization. An earlier
draft of this doc described a `template`/`variables`/`formula` (mathjs-evaluated) shape; that was aspirational
and was never implemented. Author against the shape below. The authoring-app editor
includes a live "Try It" scoring-preview sandbox that
runs the exact same `Math.abs(response - expectedValue) <= tolerance` comparison as the runtime scorer.

```json
{
  "stem": { "en": "A body starts from rest and accelerates at 2 m/s² for 5 s. Find its final velocity." },
  "expectedValue": 10,
  "tolerance": 0.5,
  "unit": "m/s",
  "correctFeedback": "Correct — v = u + at = 0 + 2×5 = 10 m/s.",
  "incorrectFeedback": "Remember v = u + at."
}
```

#### Type: `structured-descriptive@1`

Rubric-decomposed descriptive answer, authored in the authoring app.
Each `rubricPoints[]` entry is scored independently by negation-aware keyword matching (see
`src/plugins/questions/structured-descriptive/v1/scoring.js`, shared between the runtime plugin and the editor's
scoring-preview sandbox so the two can never drift), then combined by `weight`. Note the prompt field is
`prompt`, not `stem`.

- `presentationMode`: `"split-inputs"` (one textarea per rubric point) or `"single-input"` (one shared textarea).
- `evaluationMode`: `"coached"` (shows `remedyScaffold.prompt` inline when a point's match confidence is low) or
  `"assessed"` (immediate score, no hints).
- **Negation-aware matching**: a keyword match is discounted if a negation cue (`not`, `no`, `without`, `never`,
  `isn't`, `aren't`, `doesn't`, `don't`, `cannot`, `can't`) appears within a 4-token window before it — e.g.
  "the mitochondria is *not* the powerhouse" does not count as a match for the keyword "powerhouse".
- `marks` (top-level, e.g. `"marks": 3` sized to `rubricPoints.length`) is shown to the student during a test/practice test as a
  "Worth N marks" badge (`TestEngine.js`'s `resolveMarks()`, rendered by `TestSession.js`) — the CBSE-paper cue
  that this many rubric points/ideas are expected in the answer. Falls back to the test's own per-question
  `weight` (see the Question Banks section) when a question doesn't author one.

```json
{
  "prompt": { "en": "Explain why a plant cell placed in a hypertonic solution loses turgor pressure." },
  "presentationMode": "split-inputs",
  "evaluationMode": "coached",
  "rubricPoints": [
    {
      "id": "rp-osmosis",
      "weight": 1,
      "uiLabel": { "en": "Osmosis direction" },
      "keywordPatterns": ["osmosis", "water moves out", "concentration gradient"],
      "remedyScaffold": { "prompt": { "en": "Think about which way water moves — into or out of the cell?" } }
    },
    {
      "id": "rp-plasmolysis",
      "weight": 1,
      "uiLabel": { "en": "Resulting effect" },
      "keywordPatterns": ["plasmolysis", "membrane pulls away", "turgor"],
      "remedyScaffold": { "prompt": { "en": "What is the name for the membrane pulling away from the cell wall?" } }
    }
  ]
}
```

#### Type: `fuzzy-descriptive@1`

Free-text descriptive answer scored by case-insensitive substring matching against `requiredKeywords[]`, authored
via the authoring app. Simpler than `structured-descriptive@1` — no
rubric decomposition, no negation handling. `minMatchCount` sets how many keywords must appear (defaults to
`requiredKeywords.length`, i.e. all of them); `allowPartial` awards `matchCount / requiredKeywords.length` credit
when the threshold isn't met but at least one keyword matched.

```json
{
  "stem": { "en": "Describe the process of mitosis in one or two sentences." },
  "requiredKeywords": ["chromosome", "divide", "nucleus"],
  "minMatchCount": 2,
  "allowPartial": true,
  "partialFeedback": "You're on the right track — mention what happens to the chromosomes and the nucleus.",
  "correctFeedback": "Good summary of mitosis.",
  "incorrectFeedback": "Try mentioning the chromosomes, the nucleus, and cell division."
}
```

#### Type: `equation-input@1`

Asks the student to write a mathematical expression. Uses a linear syntax (x^2, sqrt(x)) and checks symbolic equivalence via numeric sampling.

```json
{
  "prompt": { "en": "A body starts from rest with acceleration a. Write its velocity as a function of time t." },
  "expectedExpression": "a*t",
  "variables": {
    "a": { "min": 1, "max": 10 },
    "t": { "min": 1, "max": 10 }
  },
  "sampleCount": 5,
  "tolerance": 0.001
}
```

#### Type: `diagram-hotspot@1`

Click/tap-to-identify interaction. Region shapes use fractional coordinates (0–1) so they scale correctly.
Note: The diagram itself is defined in a separate asset JSON file referenced by diagramRef.
 
```json
{
  "prompt": { "en": "Tap the structure that contains the cell's genetic material." },
  "diagramRef": "/content/assets/biology/cell-structure/plant-cell.json",
  "correctRegionId": "nucleus"
}
```

#### Type: `plot-function@1`

Click-to-place-points interaction on a coordinate grid — "plot y = 2x + 1". `targetFunction` is a plain-JS-arithmetic expression in `x` (evaluated through the same sandboxed, timeout-protected mathjs worker `numeric-value@1`'s own formula scoring uses — never a raw `eval()`), scored by checking each point the student places against the function within `tolerance`. The grid itself is rendered by `GraphPlotter` (`src/core/components/GraphPlotter.js`), lazy-loading D3 only when a `plot-function@1` (or a `graph` companion field, below) actually mounts.

```json
{
  "id": "q-plot-line",
  "type": "plot-function@1",
  "stem": { "en": "Plot the line y = 2x + 1 for at least three values of x." },
  "targetFunction": "2*x + 1",
  "xDomain": [-3, 3],
  "yDomain": [-6, 6],
  "minPoints": 3,
  "tolerance": 0.5
}
```

- `minPoints`/`maxPoints` (default `maxPoints = minPoints`): how many points the student must place before checking is allowed.
- `tolerance`: how far a placed point's y-value may be from the true function value and still count as correct.
- `snapStep` (default `1`): placed/dragged points round to the nearest multiple of this — matches "plot on graph paper" expectations and keeps grading fair.
- `connectPoints` (default `false`): draw a dashed line through the student's own points as they place them.
- The target curve is never shown while attempting — only after checking, alongside the student's own points colored by correctness.

### Companion `graph` field

Any `QuestionBase`-based question (`numeric-value@1`, `diagram-hotspot@1`, …) or `mcq-single@2` can attach a **read-only** graph alongside its stem — e.g. "which of these equations matches the graph below?" — the same companion-field pattern `image`/`simulation` already use, mutually exclusive with them, and (unlike `simulation`) never reveal-gated: it needs to be visible while the student is still answering.

```json
"graph": {
  "functions": [{ "expression": "2*x + 1", "label": "shown" }],
  "xDomain": [-3, 3],
  "yDomain": [-6, 6]
}
```

`functions[].expression` is evaluated the same sandboxed way as `plot-function@1`'s `targetFunction`. A `points` array (`[{x, y}, ...]`) can be plotted instead of/alongside a function for a discrete-data question.

A `functions[]` item may give `points: [[x, y], ...]` instead of `expression` (straight segments through those vertices: a piecewise F(x), a v-t graph from a table), and `fill: true` (shade between the curve and y = 0) or `fill: [x0, x1]` (shade only that stretch) for an area-under-graph question (work, displacement). `xStep`/`yStep` set the tick spacing. Function curves draw without per-sample dots. Same fields on `content-block@1`'s `graph`.

**On a lesson slide.** `content-block@1` also takes `graph` or `diagram` as its one medium (mutually exclusive with `image`/`simulation`/`photoDiagram`), mounted by `src/core/components/stepFigureHost.js`. Items may carry `revealAt` (0-indexed beat, sticky): `graph.functions[]`/`points[]`; `diagram.points/segments/polygons/angles/rightAngles/parallelMarks/circles`. The frame is fixed from the full figure (diagram viewBox; graph `yDomain`, else the range of every series), items naming a hidden point stay hidden, and `a11yCaption` is required (validator: `tools/validation/block.js`).
 
## Question Banks & Chunking

> **Naming note:** this section documents the chunked `chunks[]`/`typeIndex`
> bank format for huge randomized pools behind a single long mock exam
> (sampled via `SessionBuilder.js`, which is not currently wired into
> `TestEngine.js`/the live test-taking flow).
> It is a different, unrelated mechanism from `question-bank@1` (documented
> further below, under "Practice-Test Question Banks"), which is what
> a course bundle actually authors today for the student-portal
> "create a practice test" feature. Both happen to use the word "bank" —
> know which one you're authoring against.

For mock exams, question banks are chunked to prevent massive single-file downloads. A bank file never embeds question bodies—only IDs and a typeIndex.

### Bank File (`/content/banks/...`)

```json
{
  "bankId": "phy12-mock-bank-A",
  "subject": "physics",
  "grade": 12,
  "poolSize": 300,
  "chunks": [
    {
      "file": "/content/questions/physics/electromagnetism/chunk-01.json",
      "questionIds": ["phy12-em-q0001", "phy12-em-q0002"],
      "types": ["mcq-single@2"]
    }
  ],
  "typeIndex": {
    "mcq-single@2": { "questionIds": ["phy12-em-q0001", "phy12-em-q0002"] }
  }
}
```
  
### Chunk File (`/content/questions/.../chunk-01.json`)

Holds ~50–100 full question objects.

```json
[
  { "id": "phy12-em-q0001", "type": "mcq-single@2", "stem": { "en": "..." } },
  { "id": "phy12-em-q0002", "type": "mcq-single@2", "stem": { "en": "..." } }
]
```
 
 
## Test Definitions

A test composes sections from one or more banks with randomized selection rules.
 
```json
{
  "id": "physics-12-full-mock",
  "title": { "en": "Class 12 Physics – Full Board Mock" },
  "durationMin": 180,
  "sections": [
    {
      "name": "Section A",
      "bankId": "phy12-mock-bank-A",
      "select": 20,
      "type": "mcq-single@2",
      "marksEach": 1
    },
    {
      "name": "Section B",
      "bankId": "phy12-mock-bank-B",
      "select": 7,
      "type": "numeric-value@1",
      "marksEach": 2
    }
  ],
  "shuffleQuestions": true,
  "shuffleOptions": true
}
```

Note: Any test with durationMin above 60 will trigger the mandatory "Pre-download this Mock Exam" gate before the student can start.

## Semantic-Descriptive Answer Mode (math vs. text)

`semantic-descriptive@1`/`@2` questions grade a free-text answer against a
`rubric[]` via on-device embedding similarity (see
`src/core/evaluators/semanticSimilarityEvaluator.js`). Two optional fields
tune this for answers that involve equations/derivations (maths, physics,
chemistry) as opposed to pure prose (English, social studies, most biology):

- `answerMode`: `"math"` or `"text"` on the question itself. Set `"math"`
  whenever the model answer involves an equation, derivation, or chemical
  formula — this is the actual authoring instruction, not just documentation:
  it drives whether the student sees the subscript/superscript toolbar and
  equation composer by default, and whether the backend's symbolic-
  equivalence check runs at all. If omitted, `detectAnswerMode()` infers a
  default from the rubric's own text (only a fallback for un-annotated
  content — always set it explicitly when drafting a new bank). The student
  can still toggle the math tools on/off themselves regardless of this
  default, so getting it exactly right isn't critical, just a good default.
- `rubric[].expectedMath` (optional, per rubric point): a LaTeX target, e.g.
  `"v_1^2 + v_2^2 + 2v_1v_2 \\geq 4v_1v_2"`. If the student's answer contains
  a `$...$`-delimited span (typed by hand, or inserted via the equation
  composer) that's algebraically equivalent to it — checked with the
  vendored ComputeEngine, not just literal text match — that rubric point is
  scored as fully addressed regardless of wording or term order. This is
  what lets a correctly-rearranged derivation step score correctly even when
  it shares no exact phrasing with `accepted[]`. Only worth authoring for a
  rubric point that's actually a hard equation/inequality step, not for
  prose points — those still work exactly as before through `accepted[]`.

  **Naming constraint**: write subscripted variables as `v_1`, `v_2`
  (ordinary LaTeX subscript) — the engine handles the translation needed for
  ComputeEngine to treat them as atomic symbols. Do NOT use multi-letter
  variable names without subscripts (e.g. `KE`) — ComputeEngine's LaTeX
  parser reads adjacent letters as implicit multiplication (`KE` = `K * E`),
  same as any hand-written physics expression would be read. Stick to
  single-letter-plus-subscript variable names (`v_1`, `x_2`, `a_n`) in
  `expectedMath`.

- **Step-chain consistency check** (automatic, no authoring needed): matching
  an isolated `expectedMath` target anywhere in the answer isn't enough to
  catch a broken *derivation* — a student can drop a term partway through a
  proof and still land on every checkpoint's correct target equation, since
  each individual line of an inequality chain can be true on its own even
  when it doesn't actually follow from the line before it. To close this,
  `scoreFullAnswer` also walks every consecutive pair of `$...$` spans in the
  answer (in the order they were typed) and checks whether the later one
  follows from the earlier one by a recognized algebraic move — same
  quantity added/subtracted to both sides, both sides multiplied/divided by
  the same factor, or squaring/square-rooting both sides (this also covers
  pure restatement/factoring, the zero-delta case). A rubric checkpoint's
  `expectedMath` match only keeps its automatic full-credit shortcut if the
  *entire* prefix of the derivation up to that span is unbroken; otherwise
  scoring falls through to the ordinary `accepted[]`/embedding tiers for that
  point, exactly as if `expectedMath` had not matched, and the student sees a
  caution near the results pointing at the first broken or unparseable step.
  This is a heuristic over a fixed, small vocabulary of moves, not a general
  proof checker — a real proof step that uses a move outside that vocabulary
  (e.g. substituting a non-obvious identity) will be flagged as unverified
  even when it's mathematically fine, and a non-linear rubric (branching into
  independent sub-derivations rather than one straight chain) isn't a good
  fit for this check at all. It only ever *withdraws* automatic credit, never
  scores a rubric point below what the non-symbolic tiers would already give
  it, so the failure mode is an occasional false "needs review" flag, not a
  wrong zero.

  Only `$...$` spans that parse as a full relation (`=`, `<`, `<=`, `>`,
  `>=`) count as steps in this chain. A bare quantity named inline mid-
  sentence — e.g. "Adding $4x_1x_2$ to both sides" — is not a step and is
  excluded entirely, never compared against its neighbors. Without this, a
  perfectly sound derivation that happens to name an intermediate quantity
  this way would get a spurious "doesn't follow from the line before it"
  flag purely because a non-relation expression got treated as if it were
  one.

- **Never author `expectedMath` for a geometry rubric point.** ComputeEngine
  is an algebra engine, not a synthetic-geometry one — it has no notion of a
  segment, an angle, or a triangle. `\angle`, `\triangle`, `\parallel`, and
  `\perp` aren't recognized commands at all (confirmed empirically against
  the vendored build), and something that *does* parse, like `AB = AC`, is
  read as the product `A * B = A * C` between two ordinary one-letter
  algebra variables — not "segment AB equals segment AC." Two concrete
  failure modes follow: a correctly-written geometry relation (e.g.
  `\angle ABD = 110^\circ`) can trip a false "could not be checked" caution
  simply because the parser doesn't know `\angle`; and a genuinely correct
  proportion step (e.g. `AB/PQ = BC/QR` in a similar-triangles proof) can be
  flagged as a **false "broken step"**, because every one- or two-letter
  segment name becomes its own free algebra variable to the checker, and the
  step-chain's recognized moves (same delta/ratio, square/root) essentially
  never fire across unrelated free variables — even for a step that's
  mathematically sound. Grade geometry proofs (angle-chasing, congruence,
  similarity, circle theorems, quadrilateral proofs) on the ordinary
  `accepted[]`/embedding tier only, same as any other descriptive answer.
  `answerMode: "math"` can still be set on a geometry question purely for the
  equation-composer toolbar's convenience (rendering ∠/△/≅/∥/⊥ once typed
  works fine — only the algebraic checkers are the problem) — just make sure
  no rubric point on that question sets `expectedMath`, since that field
  alone is what turns the checkers on (`needsMathCheck` requires both
  `answerMode: "math"` and at least one `expectedMath`).

- **Numeric-consistency check on the plain embedding tier** (automatic, no
  authoring needed): applies to every rubric point that falls through to
  ordinary `accepted[]`/embedding scoring — which for a geometry proof
  (never `expectedMath`, per the point above) is every point. A sentence
  embedding model scores two structurally near-identical sentences that
  conclude with a *different* number as highly similar — confirmed
  empirically at ~0.83 cosine similarity, comfortably "addressed" under
  default thresholds, for "...= 180 - 135 = 45" against a student's own
  "...= 180 - 135 = **35**" — because the embedding is dominated by shared
  sentence structure, not the one digit that makes the answer right or
  wrong. This is the plain-prose counterpart of the step-chain problem
  above: a student's own single arithmetic slip can otherwise score full
  credit at exactly the rubric checkpoint where it happened, with only a
  later checkpoint that merely inherits the wrong number getting flagged.
  To close this, before scoring a candidate answer window against an
  accepted phrase, the standalone numbers named in that phrase (`45` from
  "angle BAC = 45 degrees") must also appear somewhere in the window, or
  the pairing's score is scaled down well below the "addressed" threshold —
  it can still win as the closest-matching (but wrong) window shown back to
  the student, just never as a full match. Only engages when the accepted
  phrase itself names a number; a purely qualitative rubric point is
  unaffected, and a subscripted variable name (`x1`, `v2`) is never read as
  a number. **Known gap**: only digits are recognized, not spelled-out
  number words ("sixty five" won't match `45`) — write the target number as
  a digit somewhere in every `accepted[]` entry that has one (as the worked
  examples in this repo already do), not spelled out in words.

## Practice-Test Question Banks (`question-bank@1`)

Live, browsable-in-the-student-portal question banks — textbook-sourced
question pools a parent draws from, in the runtime "create a practice test"
flow (`PracticeTestBuilder.js`), by manual pick or by criteria
(duration/difficulty/topic). Unlike the chunked bank format above, a
`question-bank@1` file is a **thin index**, not a pooling mechanism: one
question per bundle file as always (`questions/...`), referenced by `ref`,
with just enough denormalized metadata to filter/sample without fetching
every question body.

### Bank file (`content/courses/<bundle>/banks/bank-<id>.json`)

Discovered the same way modules/lessons/tests already are: listed in the
bundle's own `manifest.json` under a `banks` key (see `generate-bundle-manifest.js`
and `CourseSourceManager.listCatalogItems()`), never a separate root-level
catalog.

```json
{
  "id": "bank-cells-grade9",
  "type": "question-bank@1",
  "subject": "biology",
  "grade": 9,
  "chapterId": "cells",
  "title": { "en": "Cells — Practice Question Bank" },
  "questions": [
    {
      "ref": "questions/bank/q-bank-cell-division.json",
      "type": "semantic-descriptive@1",
      "topicId": "key concepts",
      "difficulty": "hard",
      "weight": 4,
      "estimatedTimeSec": 300
    }
  ],
  "authoring": { "status": "human-approved" }
}
```

- `chapterId` (single chapter) or `chapterIds` (array — a bank deliberately combining several chapters, e.g. a subject-wide revision bank) — never both, and both optional: an AI-drafted bank can leave both unset if the real chapter association isn't confidently known yet, for a human reviewer to fill in later. Either way it's cross-reference metadata only when present — a topicId just needs to belong to *some* listed chapter, not one designated per question, and `PracticeTestBuilder.js` never reads either field itself (it filters purely on each question's own `topicId`) — see `tools/validation/questionBank.js`.
- `questions[].ref` is a bundle-relative ref, resolved the same way `blockRef`/`image.src` already are (`CourseSourceManager.resolveRef()`).
- `weight` is the same field a test's own `questions[]` descriptors already carry (`TestEngine.js`'s `submit()` sums it as the question's marks — previously dead, now actually applied to scoring); default `1` if omitted.
- `difficulty` (`easy|medium|hard`) and `estimatedTimeSec` are optional but validated when present (`tools/validation/question.js`/`questionBank.js`) — they exist purely to support criteria-based auto-selection, and have no other engine meaning.
- A bank-listed question authors `explanation`/`explanationSlide` exactly like any other question (see "Explanations backed by real slides" above) — this is what powers the worked-solution review shown after a practice test is submitted. No bank-specific mechanism is needed for this; `TestSession.js`'s existing review mode already reveals it.
- A practice test's frozen `questions[]` (saved to the `practiceTests` IndexedDB store, see `docs/data-model.md` §14) is never authored content — it's built at runtime from one or more bank files and lives only on the child's device.

## Course metadata (manifest v1)

A course bundle's `manifest.json` may carry the optional fields below. Every field is optional; the engine ignores unknown fields and fills safe defaults for missing ones (`src/core/courseMeta.js`, `readCourseMeta()`). Wrong types and unknown enum values are errors in `tools/validation/manifest.js`.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | `1` |
| `description` | `{ "en": "..." }` | Short blurb for Discover |
| `audience` | `"school"` \| `"college"` \| `"adult"` | |
| `grade` | number or `null` | `null` for non-school courses |
| `board` | string | e.g. `"CBSE"` |
| `subjects` | string[] | e.g. `["biology"]` |
| `languages` | string[] | e.g. `["en"]` |
| `features` | `{ story?, narration?, games?, practice? }` | booleans |
| `estHours` | number | Estimated hours to finish |
| `repository` | `{ "url": "...", "issues": "..." }` | If `issues` is missing and the course is hosted at `https://<user>.github.io/<repo>/`, the engine uses `https://github.com/<user>/<repo>/issues` |
| `license` | string | SPDX id, e.g. `"CC-BY-4.0"` |
| `authors` | `[{ "name": "...", "url"?, "email"? }]` | |
| `version` | string | semver, e.g. `"1.2.0"` |
| `updatedAt` | string | ISO date, e.g. `"2026-11-01"` |
| `showcase` | string | Bundle-relative path to `showcase.json` |
| `requires` | `{ "engine": "1.0" }` | Minimum CoAuthor engine version |
| `cast` | string | Bundle-relative path to a story cast, e.g. `"story/cast.json"`. See "Story cast" below |

`requires.engine` is also allowed on a module JSON. Dotted numbers: `"1.2"` means engine 1.2.0 or newer. An older app does not render the course; it shows "This course needs a newer version of CoAuthor. Go to the dashboard to update." and Discover and the shelf mark the course "Needs update". The engine version is `ENGINE_VERSION` in `src/core/engineVersion.js`. The validator warns when `requires.engine` is newer than the current engine.

### Story cast (`cast.json` v1)

A course may name its own narrator and speaking characters. Without `cast` in the manifest nothing changes.

```json
{
  "castVersion": 1,
  "narrator": "kabir",
  "characters": {
    "kabir": {
      "name": { "en": "Kabir" },
      "poses": { "default": "story/kabir.svg", "think": "story/kabir-think.svg", "proud": "story/kabir-proud.svg" }
    },
    "ajji": {
      "name": { "en": "Ajji (grandmother)" },
      "short": { "en": "Ajji" },
      "poses": { "default": "story/ajji.svg", "explain": "story/ajji-explain.svg" },
      "element": "story/AjjiFigure.js"
    }
  }
}
```

- Ids and moods are lowercase words (`a-z`, `0-9`, `_`, `-`). Moods are free; `poses.default` is required, and any unknown mood shows `default`.
- Every path is bundle-relative (resolved like `image.src`). Poses are images. `element` is optional: a module whose default export is a custom element class (it gets `mood` and `expression` attributes); if it fails to load, the poses are used.
- `short` is the name shown in bubbles and chrome; `name` is used when there is no `short`.
- While the course is open, the narrator replaces the look's companion (`<companion-slot>`), the Story narrator name and the Story theatre's stagehand. Only slots the look fills are replaced: under `plain` there is no companion, so none is added. Leaving the course restores the look. The look's other pieces (coach, the cameo by a scene, confetti) stay the look's.
- **Speech bubbles.** In block markdown, `<!-- SAY kabir -->` or `<!-- SAY kabir think -->` on its own line before a paragraph makes that paragraph a speech bubble from that character: portrait at that mood, name, text. The narrator speaks from the left, others from the right. A marker before anything that is not a paragraph (a list, a heading) is ignored. SAY never creates, removes or moves a beat; a marker typed just above a `<!-- STEP -->` sentinel belongs to that beat's first paragraph.
- An unknown id, or a SAY in a course without a cast, renders as a plain paragraph (one console report).
- Check: `tools/validation/cast.js` (`validateCast(json, { exists })`, `validateSayIds(markdown, cast)`); `tools/validation/manifest.js` checks the `cast` path.

## Catalog (catalog.json v1)

Discover reads one thin catalog, published from the `coauthor-catalog` repo. Its URL is built in `src/config/publishing.js` (change the org there only). Card data comes from each course's own manifest; the catalog only says which courses are listed.

```json
{ "catalogVersion": 1, "updatedAt": "2026-11-09",
  "entries": [ { "id": "cbse9-sci-cells", "manifestUrl": "https://ORG.github.io/cbse-grade9-science/cells/manifest.json",
                 "series": "cbse-grade9-science", "label": "checked", "featured": true,
                 "addedAt": "2026-11-01", "installs": 0 } ],
  "collections": [ { "id": "featured", "title": { "en": "Featured" }, "entries": ["cbse9-sci-cells"] } ] }
```

- Required per entry: `id` (unique) and `manifestUrl` (absolute). Optional: `series`, `label` (`core`, `checked` or `outside`; set by the curator only), `featured`, `addedAt`, `installs`.
- Unknown fields are ignored. A bad entry is skipped with a warning; it never blanks the page.
- Collections list entry ids. `featured`, `new` (by `addedAt`) and `popular` (by `installs`) are also derived when not given.
- The last good catalog is cached in localStorage so Discover works offline. Dev override: `#/discover?catalogUrl=<url>`.
- A course's `showcase` (path to `showcase.json`, or an object) supplies `tagline`, `cover`, `screenshots` (`[{src, caption}]`, bundle-relative), an optional `clip` (muted WebM) and `intro` (markdown).
- Re-adding a bundle id from a different URL relocates the source (progress is kept); the same URL is reported as already added.
- Install counting is off (`INSTALL_COUNTER` in `publishing.js`). When on, only the bundle id is sent.
- To be listed, a course passes the checklist in `docs/published-content-contract.md` section 4, then a PR to `coauthor-catalog`.

## Authoring Pipeline Rules

Content is never surfaced to students while authoring.status is "ai-draft". 

- **Draft:** LLM outputs JSON with `"status": "ai-draft"`.
- **Validate:** The per-content-type modules under `/tools/validation/*.js` check JSON schema validity, cross-reference `chapterId`/`topicId` against `curriculum.json`, and verify answer keys. The Authoring App imports these modules directly for live validation while editing.
- **Review:** A human uses the static, GitHub Pages-hosted Authoring App to verify, edit, and flip status to `"human-approved"`.
- **Publish:** The runtime `ContentLoader` filters out anything not `human-approved` in production manifests.

**This is unchanged by unattended (API-driven) runs.** When the Course Designer is
driven through an API (local-server mode only), it converts and stages content
automatically at the end of a run, but everything it stages lands as `ai-draft`
with an `importBatchId`, exactly as a pasted JSON batch does. Nothing an
automated run produces reaches a student without a person approving it, and a
batch can be undone in one click. Two further guarantees hold specifically for
the automated path:

- An item **hand-edited since the last conversion is never overwritten**. There
  is no person present to confirm it, so it is skipped and named in the run
  summary. Only the interactive Convert & Import screen offers the
  overwrite-anyway tick-box.
- An item that **fails schema validation is not written at all** — it is
  reported instead. The validator's verdict is never bypassed.

## Plugin Versioning Principle

Only mint a new `type@N` version (a new `src/plugins/{blocks,questions}/<name>/vN/` directory plus a new
registry entry) for an actual breaking schema change on a type that already has real content depending on the
old shape. A pure cleanup or refactor of a plugin that has no content authored against the old version yet
should just edit the existing version in place. The registry should not accumulate near-duplicate versions —
`mcq-single@1` was deprecated and removed for exactly this reason (v2 was a near-duplicate cleanup, not a
schema evolution, and no content referenced `@1`).

