import { ContentLoader } from './ContentLoader.js';

class I18nProvider {
  constructor() {
    this.strings = {};
    this.currentLocale = 'en';
  }

  async setLocale(locale) {
    try {
      this.strings = await ContentLoader.loadJSON(`/content/i18n/${locale}/strings.json`);
      this.currentLocale = locale;
      document.documentElement.lang = locale;
    } catch (e) {
      console.warn(`[i18n] Failed to load locale ${locale}, falling back to 'en'.`);
      if (locale !== 'en') {
        await this.setLocale('en');
      }
    }
  }

  async loadCourseLocale(courseId) {
    try {
      const courseStrings = await ContentLoader.loadJSON(`/content/courses/${courseId}/i18n/${this.currentLocale}.json`);
      // Merge course strings into global strings, taking precedence
      this.strings = { ...this.strings, ...courseStrings };
    } catch (e) {
      // It's normal for courses to not have a custom i18n file yet
      console.info(`[i18n] No course-specific strings for ${courseId} in ${this.currentLocale}.`);
    }
  }

  t(key, params = {}) {
    let text = this.strings[key] || key; // Fallback to key if not found
    
    // Basic templating: {param}
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }
    
    return text;
  }
}

export const i18n = new I18nProvider();

/**
 * i18n.t(key) with an English fallback, for UI strings whose key may not be
 * in strings.json yet (or before the locale file has loaded). {param}
 * placeholders are filled in either case.
 */
/**
 * Plural pick: `<key>.one` when n is 1, else `<key>.other`, each with its own
 * English fallback; {n} is always available to the string.
 */
export function trn(key, n, one, other, params = {}) {
  return n === 1 ? tr(`${key}.one`, one, { n, ...params }) : tr(`${key}.other`, other, { n, ...params });
}

export function tr(key, fallback, params = {}) {
  let text = i18n.t(key, params);
  if (text !== key) return text;
  text = fallback;
  for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
  return text;
}
