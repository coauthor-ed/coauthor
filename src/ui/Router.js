export class Router {
  constructor() {
    this.routes = {
      '/': 'home',
      '/discover': 'discover-view',
      '/parent': 'parent-dashboard',
      '/test-dashboard': 'test-dashboard',
      '/welcome': 'landing-view',
      '/start': 'onboarding-flow',
      '/guides': 'guides-index'
    };
  }

  init() {
    // Back/Forward across a fine-grained pushState/replaceState entry (see
    // LessonSession/TestSession's own `_syncUrl()`) fires `popstate`, never
    // `hashchange` — so listening for `popstate` too is required for the
    // browser Back button to work while navigating within a single lesson/
    // test. Some browsers also fire `popstate` *and* `hashchange` for the
    // same plain `location.hash = ...` traversal (still used, unchanged, for
    // module/lesson/test-root transitions) — `_scheduleHandleRoute()` below
    // coalesces same-tick double fires into one dispatch.
    //
    // Deliberately NOT a "skip if the hash equals what I last saw" guard:
    // `_syncUrl()`'s own pushState/replaceState calls change `location.hash`
    // without this class ever finding out, so any such remembered value goes
    // stale the moment a lesson/test writes its own URL — a later Back
    // landing back on that exact string would then be silently swallowed.
    // Coalescing by event tick has no such memory to go stale.
    window.addEventListener('hashchange', () => this._scheduleHandleRoute());
    window.addEventListener('popstate', () => this._scheduleHandleRoute());
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(() => this.handleRoute(), 0);
    } else {
      window.addEventListener('load', () => this.handleRoute());
    }
  }

  _scheduleHandleRoute() {
    if (this._routeScheduled) return;
    this._routeScheduled = true;
    queueMicrotask(() => {
      this._routeScheduled = false;
      this.handleRoute();
    });
  }

  handleRoute() {
    let hash = window.location.hash.slice(1) || '/';
    const [pathPart, queryPart] = hash.split('?');
    const urlParams = new URLSearchParams(queryPart || '');

    let matchedRoute = pathPart;
    let params = {};

    // Simple dynamic route matching
    if (pathPart.startsWith('/lesson/')) {
      matchedRoute = 'lesson-session';
      params.id = pathPart.slice(8);
      params.module = urlParams.get('module');
      // Deep-link position within the lesson — see LessonSession.js/
      // LessonEngine.js for how these seed/override resumed progress.
      params.block = urlParams.get('block');
      params.beat = urlParams.get('beat');
      params.node = urlParams.get('node');
      params.blockRef = urlParams.get('blockRef');
    } else if (pathPart.startsWith('/module/')) {
      matchedRoute = 'module-dashboard';
      params.id = pathPart.slice(8);
    } else if (pathPart.startsWith('/course/')) {
      // A several-module course bundle's own page (CourseDashboard.js); id
      // is the bundle id.
      matchedRoute = 'course-dashboard';
      params.id = decodeURIComponent(pathPart.slice(8));
    } else if (pathPart.startsWith('/test/')) {
      matchedRoute = 'test-session';
      params.id = pathPart.slice(6);
      params.item = urlParams.get('item');
      params.review = urlParams.get('review');
    } else if (pathPart.startsWith('/preview/')) {
      // Standalone block/question preview — no lesson/test wrapper. `id` is
      // a bundle-relative-or-absolute content path, same convention
      // lesson/test ids already use (see ContentPreview.js), e.g.
      // "courses/<bundleId>/blocks/L01/blk-l01-s01.json".
      matchedRoute = 'content-preview';
      params.id = pathPart.slice(9);
      // Same `beat` deep-link param /lesson/ already supports (LessonEngine's
      // opts.beatIndex) — jumps a progressive-disclosure block straight to
      // that beat on mount instead of the default first-beat start.
      params.beat = urlParams.get('beat');
      // The landing page's "Two ways to read" frame: force a lesson mode for
      // this preview only (?mode=classic|story) and drop the app chrome
      // (?embed=1). The iframe is its own document, so neither leaks out.
      // ?look= is the deprecated spelling of ?mode= (a look is now the whole
      // visual identity, LookManager); still read for old links.
      params.mode = urlParams.get('mode') || urlParams.get('look');
      params.embed = urlParams.get('embed');
    } else if (pathPart.startsWith('/guides/')) {
      // One guide (docs/sprints/completed/landing-page-and-guides.md); `h` deep-
      // links to a heading inside it.
      matchedRoute = 'guide-view';
      params.slug = decodeURIComponent(pathPart.slice(8));
      params.h = urlParams.get('h');
    } else {
      matchedRoute = this.routes[pathPart] || 'not-found';
      if (matchedRoute === 'guides-index') params.for = urlParams.get('for');
    }
    
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('preview') === 'true' || urlParams.get('preview') === 'true') {
      params.preview = 'true';
    }

    // Dispatch event for AppShell to pick up
    window.dispatchEvent(new CustomEvent('route-changed', {
      detail: { route: matchedRoute, params }
    }));
  }
}
