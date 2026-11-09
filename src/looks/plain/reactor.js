import { EventBus } from '../../core/EventBus.js';
import { CUES } from '../../core/cues.js';

/**
 * The plain look's reactor: a quiet tick on a correct answer and nothing
 * else. Every other cue goes unanswered on purpose, and it never touches a
 * companion (this look has none). A scene's find is the kit's own quiet tick
 * (profile celebration 'tick', kit/SimFind.js): no cue reaches here.
 */
const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>';
const TICK_MS = 1000;

function tick() {
  document.querySelector('.plain-tick')?.remove();
  const el = document.createElement('div');
  el.className = 'plain-tick';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = TICK;
  document.body.append(el);
  setTimeout(() => el.remove(), TICK_MS);
}

export function start() {
  EventBus.on(CUES.CORRECT, tick);
  return function stop() {
    EventBus.off(CUES.CORRECT, tick);
    document.querySelector('.plain-tick')?.remove();
  };
}
