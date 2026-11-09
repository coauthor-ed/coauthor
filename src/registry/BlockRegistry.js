import { appUrl } from '../core/basePath.js';

/**
 * BlockRegistry — loads /registry/blocks.json and dynamically imports block plugins.
 * Registry is at repo root per HLD §19.
 */
export class BlockRegistry {
  static _registry = null;
  static _loaded = new Set();

  static async init() {
    if (BlockRegistry._registry) return;
    const res = await fetch(appUrl('registry/blocks.json'));
    const data = await res.json();
    BlockRegistry._registry = data.blocks ?? {};
  }

  static async loadPlugin(type) {
    if (!BlockRegistry._registry) await BlockRegistry.init();
    const config = BlockRegistry._registry[type];
    if (!config) throw new Error(`[BlockRegistry] Unknown block type: "${type}"`);
    const path = typeof config === 'string' ? config : config.path;
    if (!BlockRegistry._loaded.has(type)) {
      await import(path);
      BlockRegistry._loaded.add(type);
    }
  }

  static getPath(type) {
    const config = BlockRegistry._registry?.[type];
    return typeof config === 'string' ? config : (config?.path ?? null);
  }

  static getSummary(type, payload) {
    if (!payload) return '—';
    const config = BlockRegistry._registry?.[type];
    if (config && Array.isArray(config.summaryKeys)) {
      for (const key of config.summaryKeys) {
        const parts = key.split('.');
        let val = payload;
        for (const p of parts) {
          if (val) val = val[p];
        }
        if (typeof val === 'string' && val.trim()) {
          let output = val;
          if (config.summaryReplace?.pattern) {
            try {
              const regex = new RegExp(config.summaryReplace.pattern, 'g');
              output = output.replace(regex, config.summaryReplace.replacement || '');
            } catch (e) {
              console.warn('[BlockRegistry] Invalid summaryReplace pattern', e);
            }
          }
          return output;
        }
      }
    }
    // Default fallback
    return payload.title?.en || payload.title || payload.stem || payload.id || '—';
  }
}
