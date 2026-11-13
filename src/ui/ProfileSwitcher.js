import { LitElement, html, css } from 'lit';
import { AuthService } from '../core/AuthService.js';
import { ProgressStore } from '../core/ProgressStore.js';
import { LessonModeMixin } from '../core/mixins/LessonModeMixin.js';
import { GamificationMixin } from '../core/mixins/GamificationMixin.js';
import { LookManager } from '../core/LookManager.js';
import { gradeLabel } from '../core/gradeLabel.js';
import { ThemeManager } from '../core/ThemeManager.js';
import { iconParent, iconChevronDown, iconFlame, iconBolt, iconSliders, iconSearch, iconGuide, iconSun, iconMoon, iconShare, iconThemeDevice } from './icons/uiIcons.js';
import { engineUrl } from '../core/shareLinks.js';
import { nextPref } from '../core/themePref.js';

// Q-66: the theme preference, as the menu names it.
const THEME_NAMES = { device: 'Match device', light: 'Light', dark: 'Dark' };
const THEME_ICONS = { device: iconThemeDevice, light: iconSun, dark: iconMoon };

// The two looks a profile can choose (profile.look, LookManager.setProfile).
const LOOK_NAMES = { quill: 'Playful, with Quill', plain: 'Plain' };

/**
 * <profile-switcher>: the student's name pill in AppShell's header, and the
 * small student menu it opens (role="menu"). The menu carries the Parent area
 * link for every role (it replaced the old footer link and the parent-only
 * header link, so there is exactly one way in).
 *
 * There is no working profile switcher in the app yet (one device per child;
 * the parent portal can VIEW any child but never changes the active one), so
 * the menu has no "Switch profile" item; add one here once a real switch
 * exists.
 *
 * Behaviour: anchored popover under the pill; a bottom sheet with a scrim on
 * phones (<=600px). Closes on outside click, Esc, item activation and route
 * change. Focus moves to the first item on open and back to the pill on close
 * (except when an outside click moved it somewhere else on purpose). Arrow
 * keys, Home and End move between items.
 */
export class ProfileSwitcher extends GamificationMixin(LessonModeMixin(LitElement)) {
  static styles = css`
    :host { position: relative; display: inline-flex; }

    /* The pill matches AppShell's square .icon-btn (card + rule + lip, the
       same height), so the right side of the header reads as one set. */
    .profile-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      box-sizing: border-box;
      padding: 0 10px 0 5px;
      background: var(--bg-surface);
      border: var(--rule-w) solid var(--border-color);
      color: var(--text-main);
      border-radius: var(--radius-pill);
      box-shadow: var(--lip) var(--lip-color);
      cursor: pointer;
      font-weight: var(--fw-heavy);
      font-size: var(--fs-small);
      font-family: var(--font-family);
      transition: transform 80ms, box-shadow 80ms, border-color var(--motion-fast);
    }
    /* 44px touch floor without growing the visible pill past its neighbours. */
    .profile-btn::after { content: ''; position: absolute; inset: -3px; }
    .profile-btn:hover { border-color: var(--border-hover); }
    .profile-btn:active { transform: translateY(var(--press-travel-sm)); box-shadow: none; }
    .profile-btn:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-ring-offset); }
    .profile-btn[aria-expanded="true"] { border-color: var(--primary-color); }
    .profile-btn .chev { display: inline-flex; color: var(--text-muted); transition: transform var(--motion-base) var(--ease-settle); }
    .profile-btn[aria-expanded="true"] .chev { transform: rotate(180deg); }

    .avatar {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary-color);
      color: var(--on-primary);
      font-family: var(--font-label, var(--font-heading));
      font-weight: var(--heading-weight);
      font-size: 0.85rem;
      line-height: 1;
    }
    .avatar.lg { width: 44px; height: 44px; font-size: 1.15rem; box-shadow: var(--lip) var(--lip-color); }

    /* A long name used to push the header onto a second row: capped, and
       dropped entirely (_nameTooLong) rather than shown truncated. */
    .ps-name { max-width: 110px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    /* AppShell's header goes icon-only at the same width (its media query
       cannot reach in here). */
    @media (max-width: 900px) {
      .ps-name, .profile-btn .chev { display: none; }
      .profile-btn { height: 38px; padding: 0 3px; }
      .profile-btn::after { inset: -4px; }
    }

    /* ── The menu ─────────────────────────────────────────────────────── */
    .menu {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      z-index: 120;
      width: 300px;
      box-sizing: border-box;
      padding: var(--space-2);
      background: var(--bg-surface);
      color: var(--text-main);
      border: var(--rule-w) solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: var(--card-shadow), var(--lip) var(--lip-color);
      transform-origin: top right;
      animation: menu-in 180ms var(--ease-settle) both;
    }
    /* The little notch pointing back at the pill. */
    .menu::before {
      content: '';
      position: absolute;
      top: -8px;
      right: 22px;
      width: 12px;
      height: 12px;
      background: var(--bg-surface);
      border-left: var(--rule-w) solid var(--border-color);
      border-top: var(--rule-w) solid var(--border-color);
      transform: rotate(45deg);
      border-top-left-radius: 3px;
    }
    @keyframes menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.96); } }

    .menu-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-4);
      margin-bottom: var(--space-2);
      border-bottom: var(--rule-w) solid var(--border-color);
    }
    .who { min-width: 0; }
    .who-name {
      font-family: var(--font-label, var(--font-heading));
      font-weight: var(--heading-weight);
      font-size: 1.05rem;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin-top: 4px;
      font-size: 0.8rem;
      font-weight: var(--fw-strong);
      color: var(--text-muted);
    }
    .who-meta span { display: inline-flex; align-items: center; gap: 3px; }
    .who-meta .flame { color: var(--accent-coral); }
    .who-meta .bolt { color: var(--accent-amber); }
    .who-meta svg { width: 14px; height: 14px; }

    [role="menuitem"] {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      min-height: 48px;
      box-sizing: border-box;
      padding: 6px var(--space-3) 6px 6px;
      border: var(--rule-w) solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-main);
      font: inherit;
      font-weight: var(--fw-heavy);
      font-size: 0.95rem;
      text-align: left;
      cursor: pointer;
    }
    [role="menuitem"]:hover, [role="menuitem"]:focus-visible {
      background: var(--bg-panel);
      outline: none;
    }
    [role="menuitem"]:focus-visible { border-color: var(--primary-color); }
    .item-icon {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 11px;
      background: var(--primary-light);
      color: var(--primary-text);
    }
    .item-text { display: flex; flex-direction: column; gap: 1px; }
    /* Header items that move in here on a narrow phone (AppShell hides its
       own copies at the same widths): Discover and Guides below 480px, the
       theme toggle below 350px. */
    [role="menuitem"].narrow-480, [role="menuitem"].narrow-350 { display: none; }
    /* Empty-shelf nudge: below 480px Discover lives in this menu, so the pill
       carries the pulse ring and the Discover item a still dot. */
    .nudge-dot {
      position: absolute;
      top: 0;
      right: 0;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--accent-coral);
      box-shadow: 0 0 0 2px var(--appbar-bg, var(--bg-base));
      display: none;
    }
    .profile-btn { position: relative; }
    @media (max-width: 480px) {
      .profile-btn .nudge-dot { display: block; animation: ps-nudge 1.8s ease-out infinite; }
    }
    [role="menuitem"] .nudge-dot { display: block; position: static; margin-left: auto; flex: none; align-self: center; box-shadow: none; }
    @keyframes ps-nudge {
      0% { box-shadow: 0 0 0 2px var(--appbar-bg, var(--bg-base)), 0 0 0 2px color-mix(in srgb, var(--accent-coral) 55%, transparent); }
      70%, 100% { box-shadow: 0 0 0 2px var(--appbar-bg, var(--bg-base)), 0 0 0 11px color-mix(in srgb, var(--accent-coral) 0%, transparent); }
    }
    @media (prefers-reduced-motion: reduce) {
      .profile-btn .nudge-dot { animation: none; }
    }
    @media (max-width: 480px) { [role="menuitem"].narrow-480 { display: flex; } }
    @media (max-width: 350px) { [role="menuitem"].narrow-350 { display: flex; } }
    .item-sub { font-weight: var(--fw-medium); font-size: 0.78rem; color: var(--text-muted); }

    /* The same spin-in as AppShell's theme and lesson-mode icons (.icon-btn.spin). */
    .item-icon.spin svg { animation: icon-spin 450ms cubic-bezier(0.2, 1.3, 0.4, 1); }
    @keyframes icon-spin { from { transform: rotate(-100deg) scale(0.6); } to { transform: none; } }

    /* Story: storybook paper with a gold rule under the header. */
    :host([data-lesson-mode="story"]) .menu-head { border-bottom-color: var(--accent-gold); border-bottom-style: dashed; }
    :host([data-lesson-mode="story"]) .item-icon { background: var(--accent-gold); color: var(--opt-key-ink); border-radius: 50%; }
    :host([data-lesson-mode="story"]) .avatar { background: var(--accent-gold); color: var(--opt-key-ink); border: var(--rule-w) solid var(--border-color); box-sizing: border-box; }
    :host([data-lesson-mode="story"]) .menu { transform-origin: top right; }

    .scrim { display: none; }

    /* Phones: a bottom sheet over a scrim. */
    @media (max-width: 600px) {
      .scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 119;
        background: var(--scrim);
        animation: fade-in 180ms ease-out both;
      }
      .menu {
        position: fixed;
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        padding: var(--space-2) var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        border-bottom: none;
        box-shadow: var(--shadow-lg);
        animation: sheet-in 240ms var(--ease-settle) both;
      }
      .menu::before {
        top: 8px;
        left: 50%;
        right: auto;
        width: 40px;
        height: 5px;
        margin-left: -20px;
        border: none;
        border-radius: var(--radius-pill);
        background: var(--border-hover);
        transform: none;
      }
      .menu-head { padding-top: var(--space-5); }
      [role="menuitem"] { min-height: 56px; }
    }
    @keyframes sheet-in { from { transform: translateY(100%); } }
    @keyframes fade-in { from { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .profile-btn, .profile-btn .chev { transition: none; }
      .menu, .scrim, .item-icon.spin svg { animation: none; }
    }
  `;

  static properties = {
    _user: { type: Object, state: true },
    // True once the name's natural width overflows its cap (see _measureName).
    _nameTooLong: { type: Boolean, state: true },
    _open: { type: Boolean, state: true },
    /** Empty shelf, Discover not yet opened (AppShell, core/discoverNudge.js). */
    nudge: { type: Boolean },
    _stats: { type: Object, state: true },
  };

  constructor() {
    super();
    this._user = null;
    this._nameTooLong = false;
    this._open = false;
    this._stats = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this._user = await AuthService.getCurrentUser();
    window.addEventListener('profile-updated', this._onProfileUpdated);
    window.addEventListener('route-changed', this._onRoute);
    window.addEventListener('hashchange', this._onRoute);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('profile-updated', this._onProfileUpdated);
    window.removeEventListener('route-changed', this._onRoute);
    window.removeEventListener('hashchange', this._onRoute);
    this._unlisten();
  }

  _onProfileUpdated = async () => {
    this._nameTooLong = false;
    this._user = await AuthService.getCurrentUser();
  };

  _onRoute = () => { if (this._open) this._close(false); };

  updated(changed) {
    if (changed.has('_user')) this._measureName();
  }

  _measureName() {
    const el = this.shadowRoot?.querySelector('.ps-name');
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) this._nameTooLong = true;
  }

  // ── open / close ────────────────────────────────────────────────────────
  async _toggle() {
    if (this._open) { this._close(true); return; }
    this._open = true;
    await this.updateComplete;
    this._items()[0]?.focus();
    document.addEventListener('pointerdown', this._onOutside, true);
    document.addEventListener('keydown', this._onDocKey, true);
    this._loadStats();
  }

  _close(returnFocus) {
    if (!this._open) return;
    this._open = false;
    this._unlisten();
    if (returnFocus) this.updateComplete.then(() => this.shadowRoot.querySelector('.profile-btn')?.focus());
  }

  _unlisten() {
    document.removeEventListener('pointerdown', this._onOutside, true);
    document.removeEventListener('keydown', this._onDocKey, true);
  }

  _onOutside = (e) => {
    const path = e.composedPath();
    const menu = this.shadowRoot.querySelector('.menu');
    const btn = this.shadowRoot.querySelector('.profile-btn');
    if (path.includes(menu) || path.includes(btn)) return;
    this._close(false);
  };

  // Esc anywhere while open (focus may sit on the page after a scroll).
  _onDocKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._close(true); }
  };

  _items() {
    return [...(this.shadowRoot?.querySelectorAll('[role="menuitem"]') || [])].filter((el) => el.getClientRects().length);
  }

  _onMenuKey(e) {
    const items = this._items();
    const i = items.indexOf(this.shadowRoot.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') { this._close(false); return; }
    if (next) { e.preventDefault(); next.focus(); }
  }

  _onBtnKey(e) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this._open) { e.preventDefault(); this._toggle(); }
  }

  async _loadStats() {
    const pid = this._user?.profileId || this._user?.id;
    if (!pid) return;
    try {
      // Read-only: readStreak never advances or resets the streak.
      const [xp, streak] = await Promise.all([ProgressStore.getTotalXP(pid), ProgressStore.readStreak(pid)]);
      this._stats = { xp: xp || 0, streak: streak?.streak || 0 };
    } catch { this._stats = null; }
  }

  /** Spins the icon (same motion as the header toggles), then routes. */
  // Flips the profile's look between Quill and plain and saves it on the
  // profile; AppShell re-reads the profile on 'profile-changed' and hands it
  // to LookManager.
  async _toggleLook() {
    const id = this._user?.profileId;
    if (!id) return;
    const next = LookManager.profileLook() === 'plain' ? 'quill' : 'plain';
    try {
      const stored = await ProgressStore.get('profiles', id);
      if (!stored) return;
      await ProgressStore.put('profiles', { ...stored, look: next });
    } catch (err) {
      console.error(err);
      return;
    }
    this._close(true);
    window.dispatchEvent(new Event('profile-changed'));
    window.dispatchEvent(new Event('profile-updated'));
  }

  /** Discover / Guides, when the header has handed them to this menu. */
  _goTo(hash) {
    this._close(false);
    if (location.hash !== hash) location.hash = hash;
  }

  /** Share CoAuthor (Q-52): the engine's own address as a QR and a link. */
  async _share() {
    this._close(false);
    const { openShareSheet } = await import('./components/ShareSheet.js');
    openShareSheet({ url: engineUrl(), heading: 'Share CoAuthor', title: 'Free lessons that work offline. Scan to open the app.' });
  }

  /** Q-66: Match device, then Light, then Dark. The menu stays open so the
   *  learner sees the new label (and can tap again). */
  _cycleTheme() {
    ThemeManager.cyclePreference();
    this.requestUpdate();
  }

  _goParent(e) {
    const icon = e.currentTarget.querySelector('.item-icon');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const go = () => {
      this._close(true);
      if (location.hash !== '#/parent') location.hash = '#/parent';
    };
    if (reduce || !icon) { go(); return; }
    icon.classList.remove('spin');
    requestAnimationFrame(() => icon.classList.add('spin'));
    setTimeout(go, 380);
  }

  render() {
    if (!this._user) return html``;
    const name = this._user.name || 'Student';
    const initial = (name.trim()[0] || 'S').toUpperCase();
    const s = this._stats;
    return html`
      <button
        class="profile-btn"
        aria-haspopup="menu"
        aria-expanded="${this._open ? 'true' : 'false'}"
        aria-controls="student-menu"
        aria-label="${name}: open menu"
        title="${name}"
        @click="${() => this._toggle()}"
        @keydown="${this._onBtnKey}"
      ><span class="avatar" aria-hidden="true">${initial}</span>${this._nameTooLong ? '' : html`<span class="ps-name">${name}</span>`}<span class="chev">${iconChevronDown}</span>${this.nudge ? html`<span class="nudge-dot" aria-hidden="true"></span>` : ''}</button>
      ${this._open ? html`
        <div class="scrim" aria-hidden="true"></div>
        <div class="menu" id="student-menu" role="menu" aria-label="${name}" @keydown="${this._onMenuKey}">
          <div class="menu-head" role="none">
            <span class="avatar lg" aria-hidden="true">${initial}</span>
            <div class="who">
              <div class="who-name">${name}</div>
              <div class="who-meta">
                ${gradeLabel(this._user.grade) ? html`<span>${gradeLabel(this._user.grade)}</span>` : ''}
                ${s && this.gamified ? html`
                  <span><span class="flame">${iconFlame}</span>${s.streak} day${s.streak === 1 ? '' : 's'}</span>
                  <span><span class="bolt">${iconBolt}</span>${s.xp} XP</span>
                ` : ''}
              </div>
            </div>
          </div>
          <button role="menuitem" tabindex="-1" @click="${this._goParent}">
            <span class="item-icon">${iconParent}</span>
            <span class="item-text">${AuthService.isAdult(this._user)
              ? html`Progress and settings<span class="item-sub">Progress, practice tests and backup</span>`
              : html`Parent area<span class="item-sub">Progress, tests and settings</span>`}</span>
          </button>
          <button role="menuitem" tabindex="-1" @click="${this._toggleLook}">
            <span class="item-icon">${iconSliders}</span>
            <span class="item-text">Look: ${LOOK_NAMES[LookManager.profileLook()] || 'Playful, with Quill'}<span class="item-sub">Switch to ${LookManager.profileLook() === 'plain' ? LOOK_NAMES.quill : LOOK_NAMES.plain}</span></span>
          </button>
          <button role="menuitem" tabindex="-1" @click="${this._share}">
            <span class="item-icon">${iconShare}</span>
            <span class="item-text">Share CoAuthor<span class="item-sub">QR code and link for another phone</span></span>
          </button>
          <button role="menuitem" tabindex="-1" class="narrow-480" @click="${() => this._goTo('#/discover')}">
            <span class="item-icon">${iconSearch}</span>
            <span class="item-text">Discover<span class="item-sub">${this.nudge ? 'Find your first course' : 'Find more courses'}</span></span>
            ${this.nudge ? html`<span class="nudge-dot" aria-hidden="true"></span>` : ''}
          </button>
          <button role="menuitem" tabindex="-1" class="narrow-480" @click="${() => this._goTo('#/guides')}">
            <span class="item-icon">${iconGuide}</span>
            <span class="item-text">Guides<span class="item-sub">How the app works</span></span>
          </button>
          <button role="menuitem" tabindex="-1" class="theme-item" @click="${this._cycleTheme}">
            <span class="item-icon">${THEME_ICONS[ThemeManager.getPreference()] || iconThemeDevice}</span>
            <span class="item-text">Colours: ${THEME_NAMES[ThemeManager.getPreference()] || THEME_NAMES.device}<span class="item-sub">Switch to ${THEME_NAMES[nextPref(ThemeManager.getPreference())]}</span></span>
          </button>
        </div>
      ` : ''}
    `;
  }
}
customElements.define('profile-switcher', ProfileSwitcher);
