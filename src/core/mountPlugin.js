import { resolveTagName } from './resolveTagName.js';
import './components/PluginErrorBoundary.js';

/**
 * Mounts a plugin (block or question) following the strict initialization invariant:
 * 1. createElement(tag)
 * 2. el.init(data)
 * 3. wrap in PluginErrorBoundary
 * 4. appendChild(el)
 * 
 * @param {string} type The plugin type string (e.g., "mcq-single@2")
 * @param {object} data The content payload for the plugin
 * @param {HTMLElement} container The DOM element to append to
 * @param {...any} args Additional arguments to pass to init() (e.g., PRNG)
 * @returns {HTMLElement} The created error boundary wrapping the plugin
 */
export function mountPlugin(type, data, container, ...args) {
  const tagName = resolveTagName(type);

  const el = document.createElement(tagName);
  if (typeof el.init !== 'function') {
    throw new Error(`Plugin ${tagName} does not implement required init() method.`);
  }

  // 1. Initialize with data *before* appending to DOM
  const initResult = el.init(data, ...args);

  // 2. Wrap in boundary
  const boundary = document.createElement('plugin-error-boundary');
  boundary.appendChild(el);

  // 3. Append to target container
  container.appendChild(boundary);

  // Some plugins (e.g. equation-input@1) lazy-load heavy vendors inside an
  // async init() — mounting itself never waited on that (still doesn't,
  // this is fire-and-forget by default). `pluginReady` exposes it as an
  // always-resolving promise so a caller that needs the plugin fully ready
  // *before* doing something else with it (TestEngine.renderCurrentQuestion
  // awaits this before a caller can immediately evaluate() the just-mounted
  // question in review mode) can opt in without every mount site having to
  // duck-type `el.init`'s return value itself.
  boundary.pluginReady = initResult instanceof Promise ? initResult : Promise.resolve();

  return boundary;
}
