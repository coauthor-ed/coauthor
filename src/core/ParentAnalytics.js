import { ProgressStore } from './ProgressStore.js';
import { PracticeTestBuilder } from './PracticeTestBuilder.js';
import { ContentLoader } from './ContentLoader.js';
import { LookManager } from './LookManager.js';

/**
 * Read-only progress summaries for the parent portal (src/ui/ParentDashboard.js
 * and src/ui/components/parent/*). Moved out of ParentDashboard.js so the UI
 * only renders (invariant 8). Nothing here writes: in particular the streak is
 * read with readStreak(), which never advances or resets it (P4.4).
 *
 * Data sources (all existing stores, no schema change):
 *   profiles, lessonProgress (completed, stars, timeSpentMs, lastAccessedAt),
 *   testAttempts (totalScore/maxScore, completedAt), xpEvents (per-day XP),
 *   meta streak_<profileId>, practiceTests (titles for practice attempts).
 *
 * Honesty fixes over the old in-component version (owner review item):
 *   - lessons done counted `status === 'completed'`, a field that does not
 *     exist, so it always showed 0; it reads `completed` now;
 *   - a test with no duration no longer counts a made-up 8 minutes;
 *   - the weekly chart was a constant (every minute on "Sun", "Total: 365
 *     mins"); it is XP earned per day over the last 7 days now;
 *   - the fixed "/ 18 modules", "Top Performer" and "Grade 9 syllabus" labels
 *     are gone (no data behind them).
 */

const DAY = 86400e3;

/** Subject guessed from a test id, exactly as the old dashboard did (attempts
 *  carry no subject field). Only subjects with data are reported now. */
function guessSubject(att) {
  if (att.subject) return att.subject;
  const id = String(att.testId || '').toLowerCase();
  if (id.includes('math')) return 'Mathematics';
  if (id.includes('atom') || id.includes('chem')) return 'Chemistry';
  if (id.includes('motion') || id.includes('phys')) return 'Physics';
  if (id.includes('cell') || id.includes('bio')) return 'Biology';
  return 'English';
}

const prettifyId = (id) => {
  const base = String(id || '').split('/').pop().replace(/\.json$/i, '');
  const words = base.replace(/^practice:/, '').replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled';
};

const titleCache = new Map();
/** Best-effort lesson title: loads the lesson JSON once, falls back to a
 *  readable form of its file name (an offline or removed course). */
async function lessonTitle(lessonId) {
  if (titleCache.has(lessonId)) return titleCache.get(lessonId);
  const p = (async () => {
    try {
      const ref = String(lessonId).startsWith('/') ? lessonId : `/${lessonId}`;
      const json = await ContentLoader.loadJSON(ref);
      const t = json?.title?.en || json?.title;
      if (typeof t === 'string' && t.trim()) return t.trim();
    } catch { /* fall through */ }
    return prettifyId(lessonId);
  })();
  titleCache.set(lessonId, p);
  return p;
}

const pct = (score, max) => (max > 0 ? Math.round((score / max) * 100) : 0);

export const ParentAnalytics = {
  /** Every profile on this device, active one first. */
  async listProfiles() {
    const db = await ProgressStore.getDB();
    const profiles = (await db.getAll('profiles')) || [];
    const active = (await ProgressStore.get('meta', 'active_profile'))?.value;
    return profiles
      .map((p) => ({ ...p, profileId: p.profileId || p.id }))
      .sort((a, b) => (b.profileId === active) - (a.profileId === active) || (a.createdAt || 0) - (b.createdAt || 0));
  },

  /**
   * At-a-glance numbers plus a short recent-activity list for one child.
   * @returns {Promise<{lessonsDone, lessonsStarted, stars, threeStar, streak,
   *   xp, timeMs, lastActive, testsTaken, avgScore, recent: Array}>}
   */
  async summary(profileId) {
    const [lessons, attempts, xp, streak, practice] = await Promise.all([
      ProgressStore.getAllFromIndex('lessonProgress', 'by_profile', profileId).catch(() => []),
      ProgressStore.getAllFromIndex('testAttempts', 'by_profile', profileId).catch(() => []),
      ProgressStore.getTotalXP(profileId).catch(() => 0),
      ProgressStore.readStreak(profileId).catch(() => ({ streak: 0 })),
      PracticeTestBuilder.listPracticeTests(profileId).catch(() => []),
    ]);
    const done = lessons.filter((l) => l.completed);
    const tests = attempts.filter((a) => a.completedAt);
    const timeMs = lessons.reduce((s, l) => s + (l.timeSpentMs || 0), 0)
      + tests.reduce((s, a) => s + (a.durationMins ? a.durationMins * 60e3 : 0), 0);
    const lastActive = Math.max(0, ...lessons.map((l) => l.lastAccessedAt || l.lastUpdated || 0), ...attempts.map((a) => a.lastAccessedAt || a.completedAt || 0));
    const avgScore = tests.length ? Math.round(tests.reduce((s, a) => s + pct(a.totalScore || 0, a.maxScore || 0), 0) / tests.length) : null;
    const ptTitles = new Map(practice.map((p) => [`practice:${p.practiceTestId}`, p.title?.en || p.title]));

    const recentLessons = [...lessons]
      .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
      .slice(0, 4);
    const recent = [
      ...(await Promise.all(recentLessons.map(async (l) => ({
        kind: 'lesson',
        title: await lessonTitle(l.lessonId),
        at: l.completed ? (l.completedAt || l.lastAccessedAt) : l.lastAccessedAt,
        completed: !!l.completed,
        stars: l.stars || 0,
      })))),
      ...tests.map((a) => ({
        kind: 'test',
        title: a.title || ptTitles.get(a.testId) || prettifyId(a.testId),
        at: a.completedAt,
        score: a.totalScore || 0,
        max: a.maxScore || 0,
        pct: pct(a.totalScore || 0, a.maxScore || 0),
      })),
    ].filter((r) => r.at).sort((a, b) => b.at - a.at).slice(0, 4);

    return {
      lessonsDone: done.length,
      lessonsStarted: lessons.length,
      stars: done.reduce((s, l) => s + (l.stars || 0), 0),
      threeStar: done.filter((l) => l.stars === 3).length,
      streak: streak?.streak || 0,
      xp: xp || 0,
      timeMs,
      lastActive: lastActive || null,
      testsTaken: tests.length,
      avgScore,
      recent,
    };
  },

  /**
   * The Progress tab: tests, subjects, the last 7 days, lessons and a few
   * plain-language notes.
   */
  async details(profileId, childName = 'Your child') {
    const [lessons, attempts, practice, xpEvents, streak] = await Promise.all([
      ProgressStore.getAllFromIndex('lessonProgress', 'by_profile', profileId).catch(() => []),
      ProgressStore.getAllFromIndex('testAttempts', 'by_profile', profileId).catch(() => []),
      PracticeTestBuilder.listPracticeTests(profileId).catch(() => []),
      ProgressStore.getAllFromIndex('xpEvents', 'by_profile', profileId).catch(() => []),
      ProgressStore.readStreak(profileId).catch(() => ({ streak: 0 })),
    ]);
    const ptTitles = new Map(practice.map((p) => [`practice:${p.practiceTestId}`, p.title?.en || p.title]));
    const tests = attempts.filter((a) => a.completedAt).sort((a, b) => b.completedAt - a.completedAt);

    const testRows = tests.slice(0, 8).map((a) => ({
      title: a.title || ptTitles.get(a.testId) || prettifyId(a.testId),
      at: a.completedAt,
      score: a.totalScore || 0,
      max: a.maxScore || 0,
      pct: pct(a.totalScore || 0, a.maxScore || 0),
      durationMins: a.durationMins || null,
    }));

    const bySubject = new Map();
    for (const a of tests) {
      const k = guessSubject(a);
      const e = bySubject.get(k) || { total: 0, count: 0 };
      e.total += pct(a.totalScore || 0, a.maxScore || 0);
      e.count += 1;
      bySubject.set(k, e);
    }
    const subjects = [...bySubject].map(([subject, e]) => ({ subject, score: Math.round(e.total / e.count), count: e.count }))
      .sort((a, b) => b.score - a.score);

    // Last 7 days, oldest first, today last. Local calendar days.
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const week = Array.from({ length: 7 }, (_, i) => {
      const start = startOfToday.getTime() - (6 - i) * DAY;
      return { start, label: new Date(start).toLocaleDateString(undefined, { weekday: 'short' }), xp: 0, active: false, today: i === 6 };
    });
    const slot = (t) => { const i = Math.floor((t - week[0].start) / DAY); return i >= 0 && i < 7 ? week[i] : null; };
    for (const e of xpEvents) { const d = slot(e.timestamp || 0); if (d) { d.xp += Math.round(e.points) || 0; d.active = true; } }
    for (const l of lessons) { const d = slot(l.lastAccessedAt || 0); if (d) d.active = true; }
    for (const a of attempts) { const d = slot(a.lastAccessedAt || a.completedAt || 0); if (d) d.active = true; }

    const lessonRows = await Promise.all([...lessons]
      .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
      .slice(0, 12)
      .map(async (l) => ({
        title: await lessonTitle(l.lessonId),
        completed: !!l.completed,
        stars: l.stars || 0,
        at: l.completed ? (l.completedAt || l.lastAccessedAt) : l.lastAccessedAt,
        timeMs: l.timeSpentMs || 0,
      })));

    const notes = [];
    if (subjects.length) {
      const best = subjects[0];
      const worst = subjects[subjects.length - 1];
      notes.push({ tone: 'good', title: `Strongest: ${best.subject} (${best.score}%)`, text: `${childName}'s best average across ${best.count} test${best.count === 1 ? '' : 's'}.` });
      if (subjects.length > 1 && worst.score < 70) {
        notes.push({ tone: 'focus', title: `Worth a look: ${worst.subject} (${worst.score}%)`, text: 'A short practice test on this subject could help.' });
      }
    }
    const activeDays = week.filter((d) => d.active).length;
    if (lessons.length || tests.length) {
      notes.push({ tone: 'info', title: `${activeDays} active day${activeDays === 1 ? '' : 's'} this week`, text: !LookManager.gamificationVisible() ? '' : (streak?.streak || 0) > 0 ? `Current streak: ${streak.streak} day${streak.streak === 1 ? '' : 's'} in a row.` : 'No streak running right now.' });
    }

    return { tests: testRows, subjects, week, lessons: lessonRows, notes, activeDays };
  },
};
