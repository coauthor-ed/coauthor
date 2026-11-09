import { appUrl } from '../core/basePath.js';

/**
 * QuestionRegistry — loads /registry/questions.json and dynamically imports question plugins.
 * Registry is at repo root per HLD §19.
 */
export class QuestionRegistry {
  static _registry = null;
  static _loaded = new Set();

  static async init() {
    if (QuestionRegistry._registry) return;
    const res = await fetch(appUrl('registry/questions.json'));
    const data = await res.json();
    QuestionRegistry._registry = data.questions ?? {};
  }

  static async loadPlugin(type) {
    if (!QuestionRegistry._registry) await QuestionRegistry.init();
    const config = QuestionRegistry._registry[type];
    if (!config) throw new Error(`[QuestionRegistry] Unknown question type: "${type}"`);
    const path = typeof config === 'string' ? config : config.path;
    if (!QuestionRegistry._loaded.has(type)) {
      await import(path);
      QuestionRegistry._loaded.add(type);
    }
  }

  static getPath(type) {
    const config = QuestionRegistry._registry?.[type];
    return typeof config === 'string' ? config : (config?.path ?? null);
  }

  static getSummary(type, payload) {
    if (!payload) return '—';
    const config = QuestionRegistry._registry?.[type];
    if (config && Array.isArray(config.summaryKeys)) {
      for (const key of config.summaryKeys) {
        const parts = key.split('.');
        let val = payload;
        for (const p of parts) {
          if (val) val = val[p];
        }
        if (val && typeof val === 'object' && val.en) {
          val = val.en;
        }
        if (typeof val === 'string' && val.trim()) {
          let output = val;
          if (config.summaryReplace?.pattern) {
            try {
              const regex = new RegExp(config.summaryReplace.pattern, 'g');
              output = output.replace(regex, config.summaryReplace.replacement || '');
            } catch (e) {
              console.warn('[QuestionRegistry] Invalid summaryReplace pattern', e);
            }
          }
          return output;
        }
      }
    }
    // Default fallback (compatible with old behavior)
    return payload.title?.en || payload.title || payload.stem?.en || payload.stem || payload.id || '—';
  }
}
