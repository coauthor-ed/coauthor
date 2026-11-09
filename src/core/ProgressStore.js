import { openDB } from 'idb';
import { runMigrations } from './migrations/migrationRunner.js';
import { EventBus } from './EventBus.js';

const DB_VERSION = 13; // bump on every schema change

let dbPromise = null;

export const ProgressStore = {
  /**
   * Initializes or returns the existing IndexedDB connection.
   */
  async getDB() {
    if (!dbPromise) {
      dbPromise = openDB('CoAuthor', DB_VERSION, {
        // async: migration009 walks/rewrites existing rows and needs to
        // await requests against `tx` — see migrationRunner.js's own note.
        async upgrade(db, oldVersion, newVersion, tx) {
          await runMigrations(db, tx, oldVersion, newVersion);
        },
      });
    }
    return dbPromise;
  },

  /**
   * Helper to retrieve a single record by key.
   */
  async get(storeName, key) {
    const db = await this.getDB();
    return db.get(storeName, key);
  },

  /**
   * Helper to put a record.
   */
  async put(storeName, value) {
    const db = await this.getDB();
    return db.put(storeName, value);
  },
  
  /**
   * Helper to delete a record.
   */
  async delete(storeName, key) {
    const db = await this.getDB();
    return db.delete(storeName, key);
  },

  /**
   * Helper to retrieve all records from a specific index.
   */
  async getAllFromIndex(storeName, indexName, key) {
    const db = await this.getDB();
    return db.getAllFromIndex(storeName, indexName, key);
  },

  /**
   * Every record in a store — for a bulk read with no index to key off (an
   * export, a cross-store scan). Before this, every such caller
   * (CourseSourceManager's own loadCache(), for one) bypassed this wrapper
   * entirely via a bare `(await this.getDB()).getAll(...)` — see
   * docs/sprints/completed/cross-device-sync-and-public-deployment.md §4.2.
   */
  async getAll(storeName) {
    const db = await this.getDB();
    return db.getAll(storeName);
  },

  /**
   * Gamification: Award XP points for a profile.
   */
  /**
   * Award XP, at most once per `sourceKey`.
   *
   * `sourceKey` names the achievement, not the moment ("lesson:<id>",
   * "q:<lessonId>:<qId>", "test:<attemptId>"), so replaying a lesson or
   * re-answering a question that already paid out is a no-op. Omit it only for
   * something genuinely repeatable; without one there is no dedupe at all.
   *
   * Returns the stored event, or null when the award was skipped as a duplicate.
   */
  async awardXP(profileId, points, reason = 'activity', sourceKey = null) {
    // Every award funnels through here, so round once, centrally - a caller
    // computing points from a fractional test score (partial-credit types
    // report a fraction) must not leave a fractional xpEvent that sums into
    // a "5.6666666666 XP" total forever (getTotalXP() also rounds
    // defensively, in case one already exists from before this fix).
    const safePoints = Math.round(points) || 0;
    if (!safePoints) return null;

    const db = await this.getDB();

    if (sourceKey) {
      const existing = await db.getAllFromIndex('xpEvents', 'by_source', sourceKey);
      if (existing.some((e) => e.profileId === profileId)) return null;
    }

    const event = { profileId, points: safePoints, reason, sourceKey, timestamp: Date.now() };
    await db.put('xpEvents', event);

    // EventBus is the cross-component channel (invariant 4). The window event
    // stays for one release because StreakBadge shipped listening to it.
    EventBus.emit('xp:awarded', { profileId, points: safePoints, reason, sourceKey });
    window.dispatchEvent(new CustomEvent('xp-awarded', {
      detail: { profileId, points: safePoints, reason }
    }));
    return event;
  },

  /**
   * Gamification: Get total XP for a profile.
   */
  async getTotalXP(profileId) {
    const db = await this.getDB();
    const events = await db.getAllFromIndex('xpEvents', 'by_profile', profileId);
    // Round each event defensively - self-heals a fractional xpEvent stored
    // before awardXP() rounded at the source (see its own comment).
    return events.reduce((sum, e) => sum + (Math.round(e.points) || 0), 0);
  },

  /**
   * Gamification: Calculate or update daily streak for a profile.
   */
  async getStreakInfo(profileId) {
    // Kept as a thin alias for backwards compatibility. It used to WRITE on
    // this read path (see readStreak/touchStreak below).
    return this.readStreak(profileId);
  },

  /**
   * Read the streak without touching it.
   *
   * The old getStreakInfo() persisted a recomputed streak every time it was
   * called, and its only caller was StreakBadge.loadStats() - so merely opening
   * the dashboard advanced the streak on a new day, or reset it to 1 after a
   * gap, whether or not the student did any work. A read must not mutate.
   */
  async readStreak(profileId) {
    const record = await this.get('meta', `streak_${profileId}`);
    const today = new Date().toISOString().split('T')[0];
    if (!record || !record.value) return { streak: 0, lastActive: null };

    // Floor defensively: a stored value from a since-fixed bug (or any other
    // one-off corruption) must not render as e.g. "240.3333333333d Streak"
    // forever just because nothing here ever reads it back with fresh math.
    const { streak, lastActive } = record.value;
    const safeStreak = Math.max(0, Math.floor(streak) || 0);
    if (lastActive === today) return { streak: safeStreak, lastActive };

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    // Yesterday's streak is still alive today until the day ends; anything
    // older is already broken, and we report that without writing it down.
    return lastActive === yesterday
      ? { streak: safeStreak, lastActive }
      : { streak: 0, lastActive };
  },

  /**
   * Record activity for today and advance/reset the streak. Called by
   * GamificationService on the day's first real activity - never from a render
   * path.
   */
  async touchStreak(profileId) {
    const key = `streak_${profileId}`;
    const record = await this.get('meta', key);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const prev = record?.value;
    if (prev?.lastActive === today) return prev;   // already counted today

    // Floor prev.streak before incrementing - otherwise a single corrupted
    // fractional value keeps getting +1'd forever instead of self-healing.
    const prevStreak = Math.max(0, Math.floor(prev?.streak) || 0);
    const streak = prev?.lastActive === yesterday ? prevStreak + 1 : 1;
    const updated = { streak, lastActive: today };
    await this.put('meta', { key, value: updated });
    EventBus.emit('streak:changed', { profileId, ...updated });
    return updated;

  },

  /**
   * Append one graded-answer row to `questionAttempts`. Fills attemptKey
   * (Math.random, not crypto - plain-http runtime) and `at` if absent.
   */
  async recordQuestionAttempt(row) {
    const full = {
      bundleId: null, questionRef: null, questionId: null, chapterId: null, topicId: null,
      ...row,
      attemptKey: row.attemptKey || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      at: row.at || new Date().toISOString(),
    };
    await this.put('questionAttempts', full);
    return full;
  },

  /**
   * @param {string} profileId
   * @param {{questionKey?: string, chapterId?: string, since?: string, limit?: number}} [opts]
   *   `since` is an ISO time; `limit` keeps the most recent N. Oldest first.
   */
  async listQuestionAttempts(profileId, { questionKey, chapterId, since, limit } = {}) {
    let rows;
    if (questionKey) rows = await this.getAllFromIndex('questionAttempts', 'by_profile_question', [profileId, questionKey]);
    else if (chapterId) rows = await this.getAllFromIndex('questionAttempts', 'by_profile_chapter', [profileId, chapterId]);
    else rows = await this.getAllFromIndex('questionAttempts', 'by_profile', profileId);
    if (questionKey && chapterId) rows = rows.filter((r) => r.chapterId === chapterId);
    if (since) rows = rows.filter((r) => r.at >= since);
    rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    if (limit && rows.length > limit) rows = rows.slice(-limit);
    return rows;
  },

  /**
   * Save one learner feedback row (see FeedbackService.submit, which builds
   * and sanitises it). Fills feedbackId (Math.random, no crypto) and createdAt.
   */
  async addFeedback(row) {
    const full = {
      status: 'draft', sentAt: null, sentVia: null,
      ...row,
      feedbackId: row.feedbackId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: row.createdAt || new Date().toISOString(),
    };
    await this.put('feedback', full);
    return full;
  },

  /** @param {{status?: string, bundleId?: string}} [opts] Oldest first. */
  async listFeedback(profileId, { status, bundleId } = {}) {
    let rows = bundleId
      ? await this.getAllFromIndex('feedback', 'by_profile_bundle', [profileId, bundleId])
      : await this.getAllFromIndex('feedback', 'by_profile', profileId);
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return rows;
  },

  /** status: 'draft'|'sent'|'dismissed'; via: 'github'|'email'|'copy'|null. Returns the row or null. */
  async updateFeedbackStatus(profileId, feedbackId, status, via = null) {
    const row = await this.get('feedback', [profileId, feedbackId]);
    if (!row) return null;
    row.status = status;
    row.sentAt = status === 'sent' ? new Date().toISOString() : null;
    row.sentVia = status === 'sent' ? (via || null) : null;
    await this.put('feedback', row);
    return row;
  },

  async deleteFeedback(profileId, feedbackId) {
    await this.delete('feedback', [profileId, feedbackId]);
  },

  /**
   * Save a profile's free-text response under `noteKey`, scoped to one
   * course bundle. Overwrites any prior value for the same key - there is
   * only ever one "current" answer, not a history.
   */
  async saveNote(profileId, bundleId, noteKey, text) {
    await this.put('courseNotes', { profileId, bundleId, noteKey, text, savedAt: Date.now() });
  },

  /**
   * Read back a profile's previously saved note, or null if nothing was
   * ever saved under that key for that bundle.
   */
  async getNote(profileId, bundleId, noteKey) {
    const record = await this.get('courseNotes', [profileId, bundleId, noteKey]);
    return record ?? null;
  },

  // ── Enrollments (bookshelf/discover/identity-groundwork sprint) ─────────
  //
  // Per-profile scoping for which registered course bundles a student sees.
  // Not read directly here — reads `meta.deviceId` inline rather than
  // importing DeviceIdentity.js, which itself imports ProgressStore (would
  // be a circular import).

  /** Idempotent upsert — enrolling an already-enrolled profile just bumps
   *  `rev`/`updatedAt`/`deviceId` and re-activates a previously archived
   *  row, rather than erroring or duplicating. */
  async enroll(profileId, courseId, opts = {}) {
    const existing = await this.get('enrollments', [profileId, courseId]);
    const deviceMeta = await this.get('meta', 'deviceId');
    const row = {
      profileId,
      courseId,
      status: 'active',
      enrolledAt: existing?.enrolledAt ?? Date.now(),
      lastAccessedAt: existing?.lastAccessedAt ?? null,
      rev: (existing?.rev ?? 0) + 1,
      updatedAt: Date.now(),
      deviceId: opts.deviceId || deviceMeta?.value || null,
      ...(opts.source ? { source: opts.source } : {}),
    };
    await this.put('enrollments', row);
    return row;
  },

  /** Soft delete — matches the `courseSourceRemovedDefaults` tombstone
   *  precedent already used elsewhere in this file's sibling module
   *  (CourseSourceManager.js). A hard delete would let a future sync import
   *  silently resurrect the enrollment from another device's copy. */
  async unenroll(profileId, courseId) {
    const existing = await this.get('enrollments', [profileId, courseId]);
    if (!existing) return;
    await this.put('enrollments', {
      ...existing,
      status: 'archived',
      rev: (existing.rev ?? 0) + 1,
      updatedAt: Date.now(),
    });
  },

  async isEnrolled(profileId, courseId) {
    const row = await this.get('enrollments', [profileId, courseId]);
    return !!row && row.status === 'active';
  },

  /** Active enrollments only — an archived row is a tombstone, not a course
   *  to show. */
  async listEnrollments(profileId) {
    const rows = await this.getAllFromIndex('enrollments', 'by_profile', profileId);
    return rows.filter((r) => r.status === 'active');
  },

  /** Defensive-upserts if the row doesn't exist yet, so calling this on a
   *  profile that predates the enrollments-backfill (or was never enrolled
   *  via the normal enroll() path for some other reason) still records
   *  activity rather than silently no-op'ing. */
  async touchLastAccessed(profileId, courseId) {
    const existing = await this.get('enrollments', [profileId, courseId]);
    if (existing) {
      await this.put('enrollments', { ...existing, lastAccessedAt: Date.now(), updatedAt: Date.now() });
    } else {
      await this.enroll(profileId, courseId, { source: 'auto-touch' });
    }
  },

  /** Enrolls every existing profile in `courseId` — used by the pre-existing
   *  Parent Dashboard → Course Sources add flow, which (unlike Discover)
   *  intentionally stays "visible to every child" rather than opt-in per
   *  profile. Without this, switching HomeDashboard to enrollment-filtered
   *  rendering would silently hide anything added through that flow from
   *  every profile, since nobody would hold an enrollment row for it. */
  async enrollAllProfiles(courseId, opts = {}) {
    const db = await this.getDB();
    const profiles = await db.getAll('profiles');
    for (const p of profiles) {
      const profileId = p.profileId || p.id;
      if (profileId) await this.enroll(profileId, courseId, opts);
    }
  },
};

