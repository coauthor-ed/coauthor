import { LitElement, html, css } from 'lit';
import { A11yAnnouncer } from '../../core/A11yAnnouncer.js';

export class AudioPlayer extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }
    .player-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-base, #f4f5f7);
      border-radius: 20px;
      border: 1px solid #dfe1e6;
    }
    button {
      background: none;
      border: none;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary-text, #0052cc);
      transition: background 0.2s;
    }
    button:hover {
      background: var(--bg-base, #ebecf0);
    }
    button:focus-visible {
      outline: 2px solid #0052cc;
      outline-offset: 2px;
    }
    .progress {
      font-size: 0.9rem;
      color: var(--text-muted, #5e6c84);
      font-variant-numeric: tabular-nums;
    }
    svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
  `;

  static properties = {
    src: { type: String },
    isPlaying: { type: Boolean, state: true },
    currentTime: { type: Number, state: true },
    duration: { type: Number, state: true }
  };

  constructor() {
    super();
    this.src = '';
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this._audio = null;
  }

  firstUpdated() {
    this._audio = this.shadowRoot.querySelector('audio');
  }

  _togglePlay() {
    if (!this._audio) return;
    
    if (this.isPlaying) {
      this._audio.pause();
    } else {
      this._audio.play().catch(e => console.error("Audio playback failed", e));
    }
  }

  _onPlay() {
    this.isPlaying = true;
    A11yAnnouncer.announce('Audio playing');
  }

  _onPause() {
    this.isPlaying = false;
    A11yAnnouncer.announce('Audio paused');
  }

  _onTimeUpdate() {
    this.currentTime = this._audio.currentTime;
  }

  _onLoadedMetadata() {
    this.duration = this._audio.duration;
  }

  _formatTime(timeInSeconds) {
    if (isNaN(timeInSeconds) || !isFinite(timeInSeconds)) return '0:00';
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  render() {
    return html`
      <div class="player-container">
        <audio 
          .src=${this.src} 
          @play=${this._onPlay} 
          @pause=${this._onPause}
          @ended=${this._onPause}
          @timeupdate=${this._onTimeUpdate}
          @loadedmetadata=${this._onLoadedMetadata}
        ></audio>
        
        <button 
          @click=${this._togglePlay} 
          aria-label=${this.isPlaying ? 'Pause audio' : 'Play audio'}
        >
          ${this.isPlaying 
            ? html`<ui-icon-pause></ui-icon-pause>` 
            : html`<ui-icon-play></ui-icon-play>`}
        </button>
        
        <div class="progress" aria-hidden="true">
          ${this._formatTime(this.currentTime)} / ${this._formatTime(this.duration)}
        </div>
      </div>
    `;
  }
}

customElements.define('audio-player', AudioPlayer);
