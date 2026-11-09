import { migration001 } from './001-initial.js';
import { migration002 } from './002-gamification.js';
import { migration003 } from './003-semantic-attempts.js';
import { migration004 } from './004-course-sources.js';
import { migration005 } from './005-course-source-aggregators.js';
import { migration006 } from './006-default-course-source-state.js';
import { migration007 } from './007-xp-source-key.js';
import { migration008 } from './008-practice-tests.js';
import { migration009 } from './009-dedup-practice-test-questions.js';
import { migration010 } from './010-course-notes.js';
import { migration011 } from './011-enrollments.js';
import { migration012 } from './012-question-attempts.js';
import { migration013 } from './013-feedback.js';

const MIGRATIONS = [
  { version: 1, run: migration001 },
  { version: 2, run: migration002 },
  { version: 3, run: migration003 },
  { version: 4, run: migration004 },
  { version: 5, run: migration005 },
  { version: 6, run: migration006 },
  { version: 7, run: migration007 },
  { version: 8, run: migration008 },
  { version: 9, run: migration009 },
  { version: 10, run: migration010 },
  { version: 11, run: migration011 },
  { version: 12, run: migration012 },
  { version: 13, run: migration013 },
];

/**
 * `async` (and awaited by every migration in turn) so a data-walking
 * migration like 009 — unlike every earlier one, which is pure synchronous
 * schema setup — can `await` requests against `tx` without its failure
 * silently vanishing as an unnoticed rejection off in its own microtask
 * chain. Awaiting a plain synchronous migration's (non-Promise) return value
 * is a no-op, so this changes nothing for migrations 001-008.
 */
export async function runMigrations(db, tx, oldVersion, newVersion) {
  for (const { version, run } of MIGRATIONS) {
    if (version > oldVersion && version <= newVersion) {
      await run(db, tx, oldVersion, newVersion);
    }
  }
  await tx.objectStore('meta').put({ key: 'schemaVersion', value: newVersion });
}

