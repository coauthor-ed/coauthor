/**
 * Learner-facing grade text. `grade` on a course/module/bank may be a number
 * (9), a non-numeric string ("UG", "PG"), or absent.
 *   missing / null / empty -> '' (callers show nothing)
 *   numeric (9 or "9")     -> `${prefix} 9`
 *   other string           -> the string as-is, no prefix
 */
export function gradeLabel(grade, prefix = 'Grade') {
  if (grade == null) return '';
  const s = String(grade).trim();
  if (!s) return '';
  return /^\d+(\.\d+)?$/.test(s) ? `${prefix} ${s}` : s;
}

/** Sort comparator tolerant of mixed numeric / string grades (numbers first). */
export function compareGrades(a, b) {
  const na = Number(a), nb = Number(b);
  const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return String(a).localeCompare(String(b));
}
