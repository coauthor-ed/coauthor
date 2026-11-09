/**
 * readCourseMeta(manifest, sourceUrl) - normalised course metadata v1 with
 * safe defaults (docs/content-authoring-guide.md, "Course metadata").
 * Pure: every field is optional in the manifest; unknown fields are ignored.
 * `sourceUrl` is the manifest URL from CourseSourceManager (row.sourceUrl),
 * used only to derive repository.issues for a github.io-hosted course.
 */
const AUDIENCES = ['school', 'college', 'adult'];

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
const text = (v) => (typeof v === 'string' ? v : str(v?.en));

/** https://<user>.github.io/<repo>/... -> https://github.com/<user>/<repo>/issues, else ''. */
export function deriveIssuesUrl(sourceUrl) {
  const m = /^https?:\/\/([a-z0-9-]+)\.github\.io\/([^/?#]+)/i.exec(str(sourceUrl));
  return m ? `https://github.com/${m[1]}/${m[2]}/issues` : '';
}

export function readCourseMeta(manifest, sourceUrl = '') {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const f = m.features && typeof m.features === 'object' ? m.features : {};
  const repo = m.repository && typeof m.repository === 'object' ? m.repository : {};
  const grade = Number.isFinite(m.grade) ? m.grade : (typeof m.grade === 'string' && m.grade.trim() && !/^\d+$/.test(m.grade.trim()) ? m.grade.trim() : null);
  return {
    schemaVersion: Number.isFinite(m.schemaVersion) ? m.schemaVersion : 1,
    description: text(m.description),
    audience: AUDIENCES.includes(m.audience) ? m.audience : '',
    grade,
    board: str(m.board),
    subjects: strList(m.subjects),
    languages: strList(m.languages).length ? strList(m.languages) : ['en'],
    features: {
      story: f.story === true,
      narration: f.narration === true,
      games: f.games === true,
      practice: f.practice === true,
    },
    estHours: Number.isFinite(m.estHours) && m.estHours >= 0 ? m.estHours : null,
    repository: { url: str(repo.url), issues: str(repo.issues) || deriveIssuesUrl(sourceUrl) },
    license: str(m.license),
    authors: (Array.isArray(m.authors) ? m.authors : [])
      .filter((a) => a && typeof a === 'object' && str(a.name))
      .map((a) => ({ name: str(a.name), url: str(a.url), email: str(a.email) })),
    version: str(m.version),
    updatedAt: str(m.updatedAt),
    showcase: (typeof m.showcase === 'string' || (m.showcase && typeof m.showcase === 'object' && !Array.isArray(m.showcase))) ? m.showcase : '', // path to showcase.json, or the inline object the kit writes
    requires: { engine: str(m.requires?.engine) || (Number.isFinite(m.requires?.engine) ? String(m.requires.engine) : '') },
  };
}
