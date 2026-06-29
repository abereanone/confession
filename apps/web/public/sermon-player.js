/**
 * <sermon-player> — a small, self-contained audio player web component.
 *
 * Shared across the audio sites (macaudio, lbc, confession, jdhall). It wraps a
 * real <audio> element for accessibility / media-key support, and adds the bits
 * the native controls don't reliably give you across browsers:
 *   - an always-visible playback-speed button (0.75×–2×), remembered per visitor
 *   - skip back / forward 15s
 *   - a keyboard-accessible scrub bar (<input type="range">)
 *   - a download button
 *
 * Usage:
 *   <script src="/sermon-player.js" defer></script>
 *   <sermon-player src="/path/to.mp3" download-name="sermon.mp3"></sermon-player>
 *
 * Theming (set on the element or a parent):
 *   sermon-player { --sp-accent: #8B1F33; --sp-track: #DDD3BC; }
 *
 * No download button is rendered when the `download-name` attribute is omitted.
 */
(() => {
  if (customElements.get("sermon-player")) return;

  const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
  const RATE_KEY = "sermon-player:rate";
  const SKIP = 15;

  const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  };

  const ICONS = {
    play: '<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M0 0l12 7L0 14V0z"/></svg>',
    pause: '<svg viewBox="0 0 12 14" aria-hidden="true"><rect x="0" width="4" height="14"/><rect x="8" width="4" height="14"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 7L6 12l5 5"/><path d="M18 7l-5 5 5 5"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7l5 5-5 5"/><path d="M6 7l5 5-5 5"/></svg>',
    dl: '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 11L3.5 6.5h3V0h3v6.5h3L8 11z"/><rect x="1" y="13" width="14" height="2"/></svg>',
  };

  const CSS = `
    :host {
      display: block;
      --sp-accent: #8B1F33;
      --sp-track: rgba(0,0,0,.14);
      --sp-fg: currentColor;
      --sp-muted: rgba(0,0,0,.55);
      color: inherit;
      font: inherit;
    }
    * { box-sizing: border-box; }
    .card {
      display: flex; align-items: center; flex-wrap: wrap;
      gap: .55rem .7rem;
      width: 100%;
    }
    button {
      font: inherit; cursor: pointer; color: var(--sp-fg);
      background: transparent; border: 0; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
    }
    button:focus-visible, .seek:focus-visible {
      outline: 2px solid var(--sp-accent); outline-offset: 2px; border-radius: 4px;
    }
    .play {
      width: 2.6rem; height: 2.6rem; flex: 0 0 auto;
      border-radius: 50%; border: 2px solid var(--sp-accent); color: var(--sp-accent);
      transition: background .12s, color .12s;
    }
    .play svg { width: 12px; height: 14px; fill: currentColor; margin-left: 2px; }
    .play[data-playing="1"] svg { margin-left: 0; }
    .play:hover, .play[data-playing="1"] { background: var(--sp-accent); color: #fff; }
    .skip {
      width: 2rem; height: 2rem; flex: 0 0 auto; color: var(--sp-muted);
      position: relative;
    }
    .skip svg { width: 22px; height: 22px; }
    .skip::after {
      content: "15"; position: absolute; font-size: .52rem; font-weight: 700;
      letter-spacing: .02em; top: 50%; left: 50%; transform: translate(-50%, -45%);
    }
    .skip:hover { color: var(--sp-accent); }
    .mid { flex: 1 1 200px; min-width: 140px; display: flex; flex-direction: column; gap: .3rem; }
    .seek {
      -webkit-appearance: none; appearance: none; width: 100%; height: 6px;
      border-radius: 4px; cursor: pointer; margin: 0;
      background: linear-gradient(var(--sp-accent), var(--sp-accent)) no-repeat,
                  var(--sp-track);
      background-size: 0% 100%;
    }
    .seek::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: 13px; height: 13px;
      border-radius: 50%; background: var(--sp-accent); border: 0; cursor: pointer;
    }
    .seek::-moz-range-thumb {
      width: 13px; height: 13px; border-radius: 50%; background: var(--sp-accent);
      border: 0; cursor: pointer;
    }
    .time {
      display: flex; justify-content: space-between;
      font-variant-numeric: tabular-nums; font-size: .72rem; color: var(--sp-muted);
    }
    .rate {
      flex: 0 0 auto; min-width: 2.7rem; height: 1.9rem; padding: 0 .55rem;
      border: 1px solid var(--sp-track); border-radius: 999px;
      font-size: .8rem; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--sp-fg);
    }
    .rate:hover { border-color: var(--sp-accent); color: var(--sp-accent); }
    .dl {
      flex: 0 0 auto; width: 1.95rem; height: 1.9rem;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--sp-muted); border: 1px solid var(--sp-track); border-radius: 6px;
      text-decoration: none;
    }
    .dl svg { width: 15px; height: 15px; }
    .dl:hover { color: var(--sp-accent); border-color: var(--sp-accent); }
    @media (max-width: 480px) {
      .mid { flex-basis: 100%; order: 5; }
    }
  `;

  const loadRate = () => {
    try {
      const v = parseFloat(localStorage.getItem(RATE_KEY) || "1");
      return RATES.includes(v) ? v : 1;
    } catch { return 1; }
  };
  const saveRate = (v) => { try { localStorage.setItem(RATE_KEY, String(v)); } catch {} };

  class SermonPlayer extends HTMLElement {
    connectedCallback() {
      if (this._wired) return;
      this._wired = true;

      const root = this.attachShadow({ mode: "open" });
      const dlName = this.getAttribute("download-name");
      const src = this.getAttribute("src") || "";

      root.innerHTML =
        "<style>" + CSS + "</style>" +
        '<div class="card">' +
          '<button class="play" type="button" aria-label="Play">' + ICONS.play + "</button>" +
          '<button class="skip back" type="button" aria-label="Back 15 seconds">' + ICONS.back + "</button>" +
          '<button class="skip fwd" type="button" aria-label="Forward 15 seconds">' + ICONS.fwd + "</button>" +
          '<div class="mid">' +
            '<input class="seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" />' +
            '<div class="time"><span class="cur">0:00</span><span class="dur">--:--</span></div>' +
          "</div>" +
          '<button class="rate" type="button" aria-label="Playback speed">1×</button>' +
          (dlName
            ? '<a class="dl" aria-label="Download" download="' + dlName + '" href="' + src + '">' + ICONS.dl + "</a>"
            : "") +
        "</div>";

      const $ = (s) => root.querySelector(s);
      const playBtn = $(".play");
      const seek = $(".seek");
      const cur = $(".cur");
      const dur = $(".dur");
      const rateBtn = $(".rate");

      const audio = new Audio();
      audio.preload = "metadata";
      audio.src = src;
      this._audio = audio;

      let rate = loadRate();
      audio.playbackRate = rate;
      rateBtn.textContent = rate + "×";

      let seeking = false;
      const paint = () => {
        const d = audio.duration;
        if (!seeking && isFinite(d) && d > 0) {
          seek.value = String(Math.round((audio.currentTime / d) * 1000));
        }
        seek.style.backgroundSize = (Number(seek.value) / 10) + "% 100%";
        cur.textContent = fmtTime(audio.currentTime);
      };

      audio.addEventListener("loadedmetadata", () => { dur.textContent = fmtTime(audio.duration); paint(); });
      audio.addEventListener("timeupdate", paint);
      audio.addEventListener("ended", () => {
        playBtn.dataset.playing = "0";
        playBtn.setAttribute("aria-label", "Play");
        playBtn.innerHTML = ICONS.play;
      });

      const setPlaying = (on) => {
        playBtn.dataset.playing = on ? "1" : "0";
        playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
        playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
      };
      // Public hook so host pages (e.g. an accordion) can stop playback.
      this._pause = () => { audio.pause(); setPlaying(false); };
      playBtn.addEventListener("click", () => {
        if (audio.paused) { audio.play(); setPlaying(true); }
        else { audio.pause(); setPlaying(false); }
      });

      $(".back").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - SKIP); paint(); });
      $(".fwd").addEventListener("click", () => {
        audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + SKIP); paint();
      });

      const seekTo = () => {
        const d = audio.duration;
        if (isFinite(d) && d > 0) audio.currentTime = (Number(seek.value) / 1000) * d;
      };
      seek.addEventListener("input", () => { seeking = true; seek.style.backgroundSize = (Number(seek.value) / 10) + "% 100%"; });
      seek.addEventListener("change", () => { seekTo(); seeking = false; });

      rateBtn.addEventListener("click", () => {
        rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
        audio.playbackRate = rate;
        rateBtn.textContent = rate + "×";
        saveRate(rate);
      });
    }

    pause() { if (this._pause) this._pause(); }

    disconnectedCallback() {
      if (this._audio) { this._audio.pause(); this._audio.src = ""; }
    }
  }

  customElements.define("sermon-player", SermonPlayer);
})();
