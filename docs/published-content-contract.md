# Published content contract, v1

Status: v1, 2026-11-09. Applies to every course bundle once it is listed in the catalog or its URL has been shared with learners.

Why it exists: learner progress, resume points, answer history, feedback and (later) narration all point at content by id or path. If a published course renames something, those pointers break silently. The engine can only add features without breaking courses if both sides keep this contract.

## 1. Identity: never rename, never reuse

These are identity. Once published, keep them stable for the life of the course.

| Thing | Where | Referenced by |
|---|---|---|
| `bundleId` | `manifest.json` | progress keys, enrollments, notes, answer history, feedback |
| Lesson file path | `lessons/<file>.json` | `lessonProgress` key (`courses/<bundleId>/lessons/<file>.json`), deep links |
| Block `id` and `blockRef` path | blocks, lesson `blocks[]` | resume point (`currentBlockId`), feedback, narration segments |
| Question `id` and question file path | questions, banks | answer history (`<bundleId>::<ref>`), practice de-duplication |
| Module `id` | modules | progress stamping, module routes |
| STEP id (`<!-- STEP id="..." -->`), where present | block markdown | narration segments, later beat-level feedback |
| `chapterId` / `topicIds` values | lessons, modules, banks | daily practice eligibility |

Rules:
1. **Retire, don't delete or rename.** To replace a lesson, add a new file and remove the old one from the module's `lessons[]`. Keep the old file in place for one release so open sessions can finish.
2. **Never reuse** a retired id or path for different content.
3. **Ids are unique within a bundle**: block ids, question ids and module ids. `tools/validation` enforces this.
4. **Moving a course to a new URL is allowed.** Progress is keyed by `bundleId` and paths, not by host. Re-adding the same `bundleId` from the new URL relocates the source.

## 2. Change rules

- **Additive only.** New optional fields, files and plugin types are fine. Removing a field or changing its meaning or type is a new `type@N` (plugins) or a new `schemaVersion` (manifests).
- **Editing text is fine.** Changing a slide's wording, images or scene is a normal update. Exceptions:
  - If a lesson has narration, re-run the narration build. The validator flags stale audio by `textHash`.
  - Inserting or removing STEP markers in a published lesson shifts beat-indexed resume points, so prefer adding a new block.
- **Needs a newer engine?** Set `requires.engine`. A learner on an older cached engine then sees "update CoAuthor" instead of a broken lesson.

## 3. What the engine promises

- It ignores unknown fields in manifests, modules, lessons, blocks and questions, and keeps them in stored snapshots.
- It keeps every `type@N` plugin version it has ever shipped. An old version may be frozen, but it is never removed.
- It never changes the meaning of a published field. New behaviour gets a new optional field.
- It changes learner-record shapes only through numbered migrations, and only by adding to them.
- It treats a missing `schemaVersion` as 1.
- Optional features are switched on only by the course: narration (`narrationRef`), story cast (`cast`), practice (`chapterId` + banks). A course without the field behaves exactly as today.

## 4. Checklist for a catalog listing

`tools/validation` passes (manifest, module, lesson, bank) with no errors, plus:
- ids are unique per bundle;
- every `blockRef`, question ref and media path resolves;
- any course-local renderers pass the renderer lint;
- no script origins outside the course's own;
- the course opens in the real app at phone width;
- metadata v1 fields are filled: `audience`, `subjects`, `repository`, `license`, `version`.
- the entry follows the catalog format in `docs/content-authoring-guide.md`, "Catalog (catalog.json v1)"; the curator sets `label`, never the course.
