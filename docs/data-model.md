# Data Model: IndexedDB Schema

**Database name:** `CoAuthor`
**Access layer:** `src/core/ProgressStore.js` (wraps vendored `idb`)
**Schema owner:** any change here requires a matching file in `src/core/migrations/` — see §12.

This document is the source of truth for object stores, keys, indexes, and record shapes.
`ProgressStore.js` and `AnalyticsStore.js` must not diverge from this file; if they do, this file
is out of date and should be corrected first.

> **Rewritten 2026-09-23** against the actual migration files
> and `ProgressStore.js`/`AuthService.js`/`LessonEngine.js`/`TestEngine.js` source, not the prior
> version of this doc — which had drifted to the point of describing an `enrollments` store shape
> that didn't match what later shipped, a `profiles` shape (`displayName`/`avatarId`/`board`/
> `language`/`pinRequired`) nothing has ever written, and a `testAttempts` shape (`courseId`/
> `startedAt`/`submittedAt`/`durationMs`/`score`/`flaggedForReview`/`diagnosticFor`) that also
> doesn't exist in code. Every store below was checked against its migration file and at least one
> real reader/writer.

---

## 1. Versioning

IndexedDB databases have a single integer `version`. Every schema change (new store, new index, a
keyPath change) bumps this version and adds one numbered file to `src/core/migrations/`, wired
into `migrationRunner.js`'s `MIGRATIONS` array. A plain field added to an existing record needs no
migration (invariant 5 only covers stores/indexes/keyPaths).

```js
// src/core/ProgressStore.js
import { openDB } from 'idb';
import { runMigrations } from './migrations/migrationRunner.js';

const DB_VERSION = 12; // bump on every schema change

async getDB() {
  if (!dbPromise) {
    dbPromise = openDB('CoAuthor', DB_VERSION, {
      async upgrade(db, oldVersion, newVersion, tx) {
        await runMigrations(db, tx, oldVersion, newVersion);
      },
    });
  }
  return dbPromise;
}
```

Current version: **13**. Migration files, in order: `001-initial.js` (`profiles`,
`lessonProgress`, `testAttempts`, `sessionSnapshots`, `analyticsEvents`, `pinCredentials`, `meta`),
`002-gamification.js` (`xpEvents`), `003-semantic-attempts.js` (`semanticAttempts`),
`004-course-sources.js` (`courseSources`), `005-course-source-aggregators.js`
(`courseSourceAggregators`), `006-default-course-source-state.js`
(`courseSourceRemovedDefaults`), `007-xp-source-key.js` (`xpEvents.by_source` index),
`008-practice-tests.js` (`practiceTests`), `009-dedup-practice-test-questions.js` (data cleanup,
no schema change), `010-course-notes.js` (`courseNotes`), `011-enrollments.js` (`enrollments`), `012-question-attempts.js` (`questionAttempts`), `013-feedback.js` (`feedback`).

---

## 2. Store: `profiles`

One record per child profile on this device. `OnboardingFlow.js`'s `_finalize()` and
`AuthService.js`'s auto-create path (see its own comment on the "default_student first-run trap"
this replaces) are the only writers.

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` (**keyPath**) | `'p_' + Date.now().toString(36) + Math.random()...` — not a UUID. `crypto.randomUUID` is undefined on this app's plain-HTTP origin |
| `personId` | `string` | Stable, name-free identity separate from `profileId` (a device-local surrogate key) — for a future cross-device merge to key on. Backfilled lazily via `AuthService._ensurePersonId()` for any profile minted before this field existed |
| `name` | `string` | |
| `grade` | `number \| null` | `null` for a "College or adult" profile (no class) |
| `learner` | `'school' \| 'adult'` (optional) | Set at onboarding. `'adult'` ("College or adult") skips the parental hold gate and labels the parent area "Progress and settings" (`AuthService.isAdult`). Never inferred from a missing grade: auto-created profiles have none either. Absent = school behaviour |
| `look` | `string` (optional) | `quill` or `plain`; the look outside any open course (`LookManager.setProfile`). Absent on older profiles = follow `site.json` |
| `avatar` | `string` | An emoji, not an asset reference |
| `role` | `'student'` | Only set on the auto-created fallback row; onboarded profiles omit it |
| `autoCreated` | `boolean` | `true` only on a row `AuthService.getCurrentUser()` minted before onboarding ever ran (e.g. a shared lesson link opened pre-onboarding). `OnboardingFlow._finalize()` finds and upgrades this same row in place — set to `false` — rather than minting a second, disconnected profile |
| `createdAt` | `number` (epoch ms) | |

**Indexes:** none — profile count per device is small.

```js
db.createObjectStore('profiles', { keyPath: 'profileId' });
```

---

## 3. Store: `lessonProgress`

Tracks the resume position within a lesson, per child. Written by `LessonEngine._saveProgress()`
(debounced, in-progress) and `_complete()` (final).

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` | Part of compound key |
| `lessonId` | `string` | Part of compound key; the content path of the lesson JSON |
| `currentIndex` | `number` | Resume pointer, linear mode — index into `lesson.blocks[]` |
| `currentNodeId` | `string \| null` | Resume pointer, flow mode |
| `currentStep` | `number` | Resume pointer within the current block (progressive-disclosure beat) |
| `completed` | `boolean` | |
| `completedAt` | `number \| null` | |
| `lastUpdated` | `number` (epoch ms) | Set on every save, including `_complete()` — omitting it there used to erase it exactly when the record mattered |
| `lastAccessedAt` | `number` (epoch ms) | Same value as `lastUpdated` today; a separate field because it's what HomeDashboard's Continue Learning rail sorts by — kept distinct in case the two meanings ever diverge (e.g. a future read-only "view" that shouldn't count as an edit) |
| `timeSpentMs` | `number` | Wall-clock time in this session, not cumulative across sessions |
| `bundleId` | `string \| null` | Derived from the lessonId path `courses/<bundleId>/...`; null if not derivable |
| `moduleId` | `string \| null` | Module the lesson was opened from, if known; previous value kept otherwise |
| `chapterId` | `string \| null` | From the lesson JSON |
| `topicIds` | `string[]` | From the lesson JSON (legacy singular `topicId` becomes `[topicId]`); `[]` if absent |
| `currentBlockId` | `string \| null` | `id` (or `blockRef`) of `lesson.blocks[currentIndex]`; resume prefers it over `currentIndex` when still present, so inserting a slide earlier does not shift the resume point |

Writers merge over the previously stored record, so unknown fields survive.

`ProgressStore.put()` is a whole-record `db.put`, so every field must be written on every save —
anything omitted is deleted.

**Keying:** compound key `[profileId, lessonId]`.

```js
const store = db.createObjectStore('lessonProgress', { keyPath: ['profileId', 'lessonId'] });
store.createIndex('by_profile', 'profileId');
```

**Query patterns:**
- Resume a specific lesson: `store.get([profileId, lessonId])`
- All lessons a child has touched (HomeDashboard's progress rings + Continue rail):
  `store.index('by_profile').getAll(profileId)`

---

## 4. Store: `testAttempts`

One record per completed or in-progress test attempt, including practice tests (`testId` prefixed
`practice:`). Written by `TestEngine.saveProgress()` (debounced, in-progress) and `submit()`
(final).

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` | Part of compound key |
| `attemptId` | `string` | `` `attempt-${Date.now()}-${random}` `` |
| `testId` | `string` | Matches a content test's id, or `` practice:<practiceTestId> `` |
| `seed` | `number` | PRNG seed used for question sampling/shuffling |
| `currentIndex` | `number` | Resume pointer |
| `answers` | `Record<position, unknown>` | Keyed by the question's *position* in the test (`this.currentIndex` as a string), not its content id — a bank-pooled practice test can draw the same question id twice from different bundles, and keying by id would let one answer overwrite the other's |
| `results` | `object \| undefined` | Set on `submit()` only — per-question scoring output |
| `totalScore` / `maxScore` | `number \| undefined` | Set on `submit()` only |
| `completedAt` | `number \| null` | `null`/absent while in progress |
| `lastUpdated` | `number` (epoch ms) | Set on every save, including the final `submit()` write — omitting it there used to erase it exactly when the record mattered |
| `lastAccessedAt` | `number` (epoch ms) | Same reasoning as `lessonProgress`'s own field — feeds the Continue Learning rail's "paused test" entries |

**Keying:** compound key `[profileId, attemptId]`, since a child can retake the same test (a
retake deletes the prior *completed* attempt — see `TestEngine.js`).

```js
const store = db.createObjectStore('testAttempts', { keyPath: ['profileId', 'attemptId'] });
store.createIndex('by_profile', 'profileId');
store.createIndex('by_profile_test', ['profileId', 'testId']);
```

**Query patterns:**
- Resume in-progress attempt: `store.get([profileId, attemptId])`
- All attempts at a given test: `store.index('by_profile_test').getAll([profileId, testId])`
- All attempts for ParentDashboard rollups / HomeDashboard's completed/paused lookups:
  `store.index('by_profile').getAll(profileId)`

**Known defect (not yet fixed):** descriptive question plugins (`fuzzy-descriptive@1`,
`semantic-descriptive@1/2`, `structured-descriptive@1`) emit `question:interaction`;
`TestEngine.js` was still listening for `interaction:question` until the emit side was
fixed — verify this hasn't regressed before trusting `answers` completeness for
those question types.

---

## 5. Store: `enrollments`

Per-profile scoping for which registered course bundles a student sees on their bookshelf —
replaces the old device-global "every registered source visible to every profile" behavior.
Added in migration 011. Written by
`ProgressStore.enroll()`/`unenroll()`/`touchLastAccessed()`/`enrollAllProfiles()`.

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` | Part of compound key |
| `courseId` | `string` | Part of compound key — a bundleId |
| `status` | `'active' \| 'archived'` | `unenroll()` soft-deletes (archives) rather than hard-deleting — a hard delete would let a future sync import silently resurrect the row from another device's copy |
| `enrolledAt` | `number` (epoch ms) | Preserved across re-enrolls |
| `lastAccessedAt` | `number \| null` (epoch ms) | |
| `rev` | `number` | Incremented on every write — sync-forward-compat, not consumed by anything yet |
| `updatedAt` | `number` (epoch ms) | Sync-forward-compat |
| `deviceId` | `string \| null` | This install's id (`DeviceIdentity.js`) — sync-forward-compat |
| `source` | `string` | Optional — e.g. `'discover'`, `'course-sources-panel'`, `'backfill'` |

A profile with **zero** enrollment rows at all is treated as enrolled in everything (never
filtered) — this covers every profile that existed before this store shipped, and any brand-new
one before it's touched Discover. `HomeDashboard.js` backfills real rows for such a profile once,
gated by a `meta` flag `enrollments_backfilled_<profileId>`.

**Keying:** compound key `[profileId, courseId]`.

```js
const store = db.createObjectStore('enrollments', { keyPath: ['profileId', 'courseId'] });
store.createIndex('by_profile', 'profileId');
```

**Note:** this is the only store carrying `rev`/`updatedAt`/`deviceId` — the seven pre-existing
stores are deliberately *not* retrofitted with them; that belongs to the (separate, not yet built)
cross-device-sync merge engine's own future work.

---

## 5b. Store: `questionAttempts`

Append-only history, one row per graded answer. Added in migration 012. Written by
`LessonEngine._recordAttempt()` (on each Check, via `question:graded`) and `TestEngine._computeResults({record:true})`
(on submit; `practice:<id>` tests get `source: 'practice'`). Failures are reported through ErrorReporter and never
break the session. Included in data export/import (the panel exports every store).

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` | Part of key |
| `attemptKey` | `string` | Part of key; `${Date.now()}-${Math.random()...}` (no crypto: plain http) |
| `questionKey` | `string` | `${bundleId}::${questionRef or id}` |
| `bundleId`, `questionRef`, `questionId`, `chapterId`, `topicId` | `string \| null` | bundleId null for bundle-less content |
| `source` | `'lesson' \| 'test' \| 'practice'` | |
| `sourceId` | `string` | lessonId or testId |
| `correct` | `boolean` | |
| `score`, `maxScore` | `number` | |
| `firstTry` | `boolean` | Lessons: first verdict for that question this session; tests: true |
| `at` | `string` (ISO) | |

Key `[profileId, attemptKey]`; indexes `by_profile`, `by_profile_question` (`[profileId, questionKey]`),
`by_profile_chapter` (`[profileId, chapterId]`). API: `ProgressStore.recordQuestionAttempt(row)`,
`listQuestionAttempts(profileId, {questionKey?, chapterId?, since?, limit?})`.

---

## 5c. Store: `feedback`

Learner "Tell us" flags on a lesson slide, kept locally until a parent sends them. Added in migration 013.
Written via `FeedbackService.submit()`; read by the parent outbox. No learner name is stored or ever put in
output. `text` is plain text: every renderer must escape it (invariant 6). Included in data export/import
(the panel exports every store).

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` | Part of key; never included in sent output |
| `feedbackId` | `string` | Part of key; `${Date.now()}-${Math.random()...}` |
| `bundleId`, `lessonId`, `blockId`, `blockRef` | `string \| null` | |
| `beatIndex` | `number \| null` | |
| `beatExcerpt` | `string` | First 160 chars of the beat's plain text |
| `kind` | `'typo' \| 'confusing' \| 'wrong' \| 'broken' \| 'idea'` | |
| `text` | `string` | At most 1000 chars, control characters stripped |
| `contentVersion` | `string \| null` | Manifest version |
| `engineVersion` | `string` | From `engineVersion.js` |
| `createdAt` | `string` (ISO) | |
| `status` | `'draft' \| 'sent' \| 'dismissed'` | |
| `sentAt` | `string \| null` (ISO) | |
| `sentVia` | `'github' \| 'email' \| 'copy' \| null` | |

Key `[profileId, feedbackId]`; indexes `by_profile`, `by_profile_bundle` (`[profileId, bundleId]`). API:
`ProgressStore.addFeedback(row)`, `listFeedback(profileId, {status?, bundleId?})`,
`updateFeedbackStatus(profileId, feedbackId, status, via)`, `deleteFeedback(profileId, feedbackId)`;
higher level in `src/core/FeedbackService.js`.

---

## 6. Store: `sessionSnapshots`

Declared in migration 001. **Unused** — confirmed zero reads/writes anywhere in `src/` (verified
by a codebase audit). Kept in the schema only because removing an
object store needs its own migration for no functional benefit; do not build against this without
first confirming it's still genuinely dead.

```js
db.createObjectStore('sessionSnapshots', { keyPath: ['profileId', 'sessionId'] });
```

---

## 7. Store: `analyticsEvents`

Append-only raw event log. Written by `AnalyticsStore.logEvent(profileId, eventName, payload)`.

| Property | Type | Notes |
|---|---|---|
| `id` | `number` (autoincrement, **keyPath**) | Not stable across devices — a future sync import must re-key this per-device (`deviceId`, `localId`), never copy it verbatim |
| `profileId` | `string` | |
| `eventName` | `string` | Not `type` — matches `AnalyticsStore.logEvent()`'s actual parameter name |
| `payload` | `Record<string, unknown>` | Event-specific fields, kept small — never free text/PII |
| `timestamp` | `number` (epoch ms) | |

```js
const store = db.createObjectStore('analyticsEvents', { keyPath: 'id', autoIncrement: true });
store.createIndex('by_profile_time', ['profileId', 'timestamp']);
```

**Privacy constraint:** `payload` must never contain free-text answers or PII.

---

## 8. Store: `pinCredentials`

Declared in migration 001. **Unused** — `Hasher.js` (the only code that would read/write this) is
imported nowhere in `src/`, and the parental gate is `<parental-gate-hold>` (press-and-hold), not a
PIN. Kept in the schema for the same reason as `sessionSnapshots` above. Do not build a PIN-based
identity scheme against this without first re-confirming it's still dead.

```js
db.createObjectStore('pinCredentials', { keyPath: 'owner' });
```

---

## 9. Store: `meta`

Small key-value store for schema/app bookkeeping — not domain data.

| Property | Type | Notes |
|---|---|---|
| `key` | `string` (**keyPath**) | |
| `value` | `unknown` | |

```js
db.createObjectStore('meta', { keyPath: 'key' });
```

Known keys:
- `schemaVersion` — mirrors `DB_VERSION`, written by the migration runner after a successful upgrade
- `active_profile` — the currently-selected `profileId`
- `deviceId` — this install's id (`DeviceIdentity.js`). **Must not travel** during any future
  cross-device import
- `onboarding_complete` — boolean. **Must not travel** during any future import
- `streak_<profileId>` — `{ streak, lastActive }`, written by `ProgressStore.touchStreak()`. **Must
  travel** (rewritten by profileId) during any future import, or a streak can't resume on another
  device
- `active_<profileId>_<testId>` — pointer to an in-progress test attempt, written by
  `TestEngine.js`. **Must travel** (rewritten by profileId), or a test can't resume on another
  device
- `enrollments_backfilled_<profileId>` — one-time backfill gate, see §5

---

## 10. Store: `courseNotes`

Small per-profile scratch space so one lesson block can save a free-text response and a
*different* block — possibly in a different lesson or module, possibly a different course bundle
entirely — can read it back later. Deliberately separate from `lessonProgress` (resume pointers
only, §3) and `analyticsEvents` (§7 forbids free text in its payload).

| Property | Type | Notes |
|---|---|---|
| `profileId` | `string` (**keyPath**, part 1) | |
| `bundleId` | `string` (**keyPath**, part 2) | Scopes the key so two bundles can each use a plain `noteKey` without colliding |
| `noteKey` | `string` (**keyPath**, part 3) | Author-chosen (`reflection@1` block's `saveResponseAs`/`showSavedNote`) |
| `text` | `string` | The learner's saved response, verbatim |
| `savedAt` | `number` (epoch ms) | |

```js
const courseNotes = db.createObjectStore('courseNotes', { keyPath: ['profileId', 'bundleId', 'noteKey'] });
courseNotes.createIndex('by_profile', 'profileId');
```

Written by `ProgressStore.saveNote()`, read by `ProgressStore.getNote()` — a later `put`
overwrites the prior value; there is only ever one "current" answer, not a history.

---

## 11. Other stores (gamification, sources, practice tests)

Documented in less depth here since they're stable and rarely a source of confusion — see the
named migration file for the authoritative shape.

- **`xpEvents`** (migration 002, `by_source` index added in 007) — `{ id (autoincrement), profileId,
  points, reason, sourceKey, timestamp }`. `sourceKey` names the achievement, not the moment, so
  `ProgressStore.awardXP()` can dedupe against replaying an already-rewarded lesson/question.
- **`semanticAttempts`** (migration 003) — per-rubric-point coaching analytics for
  `semantic-descriptive@1/2`. Keyed `[profileId, attemptId]`, indexes `by_profile` and
  `by_profile_question`.
- **`courseSources`** (migration 004) — one row per registered remote course bundle, keyed
  `bundleId`: `{ bundleId, origin: 'remote', baseUrl, sourceUrl, isDefault, manifest, addedAt }`.
- **`courseSourceAggregators`** (migration 005) — one row per registered bundle-manifest.json,
  keyed `bundleManifestId`.
- **`courseSourceRemovedDefaults`** (migration 006) — tombstone, keyed `url`: a default source the
  user explicitly removed, so `seedDefaults()` never silently re-adds it. The model
  `enrollments.status: 'archived'` (§5) follows for the same reason.
- **`practiceTests`** (migration 008) — a parent/child-built test definition, keyed
  `[profileId, practiceTestId]`. Attempts against it are ordinary `testAttempts` rows with
  `testId: practice:<practiceTestId>`, not a separate store.


---

## 12. Migrations

`src/core/migrations/migrationRunner.js` runs numbered migration modules inside `idb`'s
`upgrade(db, oldVersion, newVersion, tx)` callback, `async` (awaited in turn) so a data-walking
migration can `await` requests against `tx` without its failure silently vanishing:

```js
// src/core/migrations/migrationRunner.js
import { migration001 } from './001-initial.js';
// ... one import per migration ...
import { migration011 } from './011-enrollments.js';
import { migration012 } from './012-question-attempts.js';
import { migration013 } from './013-feedback.js';

const MIGRATIONS = [
  { version: 1, run: migration001 },
  // ...
  { version: 11, run: migration011 },
  { version: 12, run: migration012 },
  { version: 13, run: migration013 },
];

export async function runMigrations(db, tx, oldVersion, newVersion) {
  for (const { version, run } of MIGRATIONS) {
    if (version > oldVersion && version <= newVersion) {
      await run(db, tx, oldVersion, newVersion);
    }
  }
  await tx.objectStore('meta').put({ key: 'schemaVersion', value: newVersion });
}
```

**Rules for future migrations:**
- Never mutate an existing migration file once it has shipped — add a new numbered one.
- If a field's meaning changes (not just added), the migration must backfill/transform existing
  records via a cursor over the old store, not just declare the new index.
- A plain additive field on an existing record needs no migration at all (see `lessonProgress`'s
  `lastAccessedAt`, added without one).

---

## 13. Storage size considerations

- `analyticsEvents` and `semanticAttempts` are the only meaningfully-unbounded-growth stores
  today (one row per event / per question view respectively) — neither has automated pruning yet.
  A live-device audit found ~300 `semanticAttempts` rows for one
  child after normal use; fine at that scale, worth revisiting if it becomes a support issue.
- `navigator.storage.persist()` is called on app boot (`src/app.js`) but only actually runs once
  the origin is a secure context (HTTPS) — on today's plain-HTTP LAN deployment it's a no-op, and a
  refusal is now surfaced as a toast rather than only logged.

---

## 14. Sync-relevant gaps (for future work, not present state)

Documented here so a future cross-device-sync implementation doesn't have to re-derive them:

- No store besides `enrollments` carries `rev`/`deviceId`/a dirty flag.
- Deletions are hard deletes with no tombstone, except `courseSourceRemovedDefaults` and
  `enrollments.status: 'archived'`.
- Timestamp field naming is inconsistent across stores (`lastUpdated` vs. `updatedAt` vs.
  `addedAt`) — a real merge engine would need to normalize this or read each store's own
  convention explicitly.
- `profileId` is a **device-local surrogate key**, not a person identity — `personId` (§2) is the
  field a future merge would key people on instead. That work is
  parked, not built, as of this writing.
