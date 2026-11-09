import { LookManager } from '../core/LookManager.js';

/**
 * changePage(update, opts): moving between pages (AppShell routes, Story
 * slides) the way the active look shows it. The look's brand module may
 * export turnPage(update, opts) and canTurnPage() (Quill's page turn,
 * src/ui/pageTurn.js); a look without them just runs `update`, a plain page
 * change. Same signature and result as turnPage: true when a show ran.
 * docs/ui-ux-design-system.md 1.1.1b.
 */
export async function changePage(update, opts) {
  const turn = LookManager.brand()?.turnPage;
  if (typeof turn === 'function') return turn(update, opts);
  await update();
  return false;
}

/** Whether changePage() would run a show right now. */
export function canChangePage() {
  const can = LookManager.brand()?.canTurnPage;
  return typeof can === 'function' ? !!can() : false;
}
