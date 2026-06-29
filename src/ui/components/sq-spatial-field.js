// <sq-spatial-field> — the entrance hero background: "Self-Drafting Manifest".
//
// A warm-graphite drafting sheet powers on under a single descending GREEN
// scanline that develops the datum grid in its wake and, as it crosses each one,
// ignites steel Manhattan-routed connectors and bordered ticket-stamp part-nodes
// into a self-assembling bill-of-materials schematic; a green signal then threads
// the finished graph, and everything settles into a calm, permanently-lit
// blueprint with three nodes frozen mid-pulse + registration chrome. The reveal
// uses additive ('lighter') compositing so the single green accent reads as
// LIGHT, not a vanishing low-alpha stroke.
//
// A center-exclusion zone keeps all structure clear of the wordmark/CTAs above
// (z-index:2); the loop self-terminates at rest (zero CPU for the static
// background). Respects prefers-reduced-motion (renders the static end-state
// once). Colours come from the CSS token system; pure presentation, no authority.

import { LitElement, html } from 'lit';

// --- timeline (seconds) -----------------------------------------------------
const SCAN_START = 0.25;
const SCAN_DUR = 1.55;
const BEAM_START = 1.85;
const BEAM_DUR = 1.5;
const SETTLE_START = 2.35;
const SETTLE_END = 3.4;
const REST = SETTLE_END;

// --- math helpers -----------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// overshoot pop 0.6 -> 1.15 -> 1
const pop = (t) => {
  t = clamp(t, 0, 1);
  if (t >= 1) return 1;
  return 0.6 + (1.15 - 0.6) * Math.sin(Math.min(t, 0.6) / 0.6 * (Math.PI / 2)) - (t > 0.6 ? (1.15 - 1) * ((t - 0.6) / 0.4) : 0);
};

function rgbTriplet(value, fallback) {
  let v = (value || '').trim();
  if (!v) v = fallback;
  if (v.startsWith('rgb')) {
    const m = v.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (m) return `${m[1]},${m[2]},${m[3]}`;
  }
  const h = v.replace('#', '');
  if (h.length === 3) {
    return `${parseInt(h[0] + h[0], 16)},${parseInt(h[1] + h[1], 16)},${parseInt(h[2] + h[2], 16)}`;
  }
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const raw = (n) => cs.getPropertyValue(n).trim();
  const tri = (n, fb) => rgbTriplet(raw(n), fb);
  return {
    ink: tri('--ink', '#001233'),
    paperGround: tri('--paper-ground', '#001a52'),
    ink2: tri('--ink-2', '#002082'),
    ink3: tri('--ink-3', '#0a2e9e'),
    paperDim: tri('--paper-dim', '#8e9fd4'),
    paperFaint: tri('--paper-faint', '#5a6cb0'),
    signal: tri('--signal', '#3057e1'),
    signalDeep: tri('--signal-deep', '#1e3fb0'),
    steel: tri('--steel', '#4a6de5'),
    grid: tri('--grid', '#7896eb'),
  };
}

// Small deterministic PRNG so the field is stable across reloads.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SqSpatialField extends LitElement {
  static properties = {
    // Set to render one static frame and run no loop.
    static: { type: Boolean, reflect: true },
    // Draw the crane-specific structure. Disabled on mobile while retaining the field reveal.
    crane: { type: Boolean, reflect: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.static = false;
    this.crane = true;
    this._raf = 0;
    this._w = 0;
    this._h = 0;
    this._dpr = 1;
    this._t = 0; // timeline accumulator (seconds)
    this._last = 0;
    this._alpha = 0; // global ease-in 0 -> 1
    this._warp = 1; // fast-forward factor when skipped
    this._stopped = false;
    this._reduced = false;
    this._ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    this._nodes = [];
    this._edges = [];
    this._beamPath = [];
    this._frozen = [];
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onSkip = this._onSkip.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  render() {
    return html`<canvas></canvas>`;
  }

  firstUpdated() {
    this._canvas = this.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._palette = readPalette();
    this._resize();

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this);
    }

    // Re-align the crane's hook to the wordmark once webfonts settle (the
    // wordmark's measured width shifts when VT323 finishes loading).
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!this._canvas) return;
        this._buildGraph();
        if (this._stopped || this._reduced || this.static) this._drawFrame(REST, true);
      });
    }

    if (this._reduced || this.static) {
      this._alpha = 1;
      this._drawFrame(REST, true); // the static end-state, once
      return;
    }

    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this._onSkip, { passive: true, once: true });
    window.addEventListener('keydown', this._onSkip, { once: true });
    window.addEventListener('wheel', this._onSkip, { passive: true, once: true });

    this._raf = requestAnimationFrame(this._tick);
  }

  disconnectedCallback() {
    this._teardown();
    super.disconnectedCallback();
  }

  // Public — programmatically skip to the settled static frame.
  fade() {
    this._onSkip();
  }

  _onSkip() {
    this._warp = 9; // rush the remaining timeline into the settled frame
  }

  _teardown() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    window.removeEventListener('pointermove', this._onPointerMove);
  }

  _onResize() {
    this._resize();
    if (this._stopped || this._reduced || this.static) this._drawFrame(REST, true);
  }

  updated(changed) {
    if (changed.has('crane') && (this._stopped || this._reduced || this.static)) {
      this._drawFrame(REST, true);
    }
  }

  _onPointerMove(e) {
    this._ptr.tx = e.clientX / Math.max(1, window.innerWidth);
    this._ptr.ty = e.clientY / Math.max(1, window.innerHeight);
  }

  _resize() {
    const rect = this.getBoundingClientRect();
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._w = Math.max(1, Math.floor(rect.width));
    this._h = Math.max(1, Math.floor(rect.height));
    this._canvas.width = Math.floor(this._w * this._dpr);
    this._canvas.height = Math.floor(this._h * this._dpr);
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this._buildGraph();
  }

  // --- graph construction (normalized 0..1 coords) --------------------------
  _buildGraph() {
    const W = this._w;
    const H = this._h;
    const rnd = mulberry32(0x5741971b);

    // A construction TOWER CRANE drawn as a technical blueprint over the grid.
    // The vertical lattice MAST is the top<->bottom spine; a long JIB reaches left
    // over the wordmark with a trolley + hook lifting a BOM part; a COUNTER-JIB +
    // counterweight balance it; stay cables fan from the cathead apex; a base sits
    // on the ground line. Mast/jib are grid-scaled; the lattice + stays are the
    // diagonals. The green signal climbs the mast and runs out to the hook.
    const M = clamp(Math.floor(Math.min(W, H) / 12), 58, 84);
    const rows = Math.floor(H / M);

    const nodes = [];
    const edges = [];
    const P = (px, py) => [px / W, py / H];
    const addEdge = (ptsPx, opt) => {
      const o = opt || {};
      const pts = ptsPx.map((p) => P(p[0], p[1]));
      const e = { pts, lowerY: Math.max(...pts.map((p) => p[1])), gateT: -1, w: o.w || 1.25, cable: !!o.cable };
      edges.push(e);
      return e;
    };
    const addNode = (px, py, hero, label) => {
      const n = { x: px / W, y: py / H, idx: 0, hero: !!hero, lit: false, label };
      nodes.push(n);
      return n;
    };

    // --- crane layout (px, tied to the grid scale M) ---
    const colSnap = (frac) => Math.round((frac * W) / M) * M;
    const bx = clamp(colSnap(0.62), 4 * M, W - 3 * M); // mast centre x (grid column)
    const groundY = (rows - 1) * M;                    // base on a grid row
    const mastTopY = Math.max(1.9 * M, M + 24);        // jib height / top of mast
    const apexY = Math.max(8, mastTopY - 1.15 * M);    // cathead apex
    const mw = Math.max(7, Math.round(0.34 * M));      // mast half-width
    const railL = bx - mw;
    const railR = bx + mw;

    // 1 — MAST: two rails + X-lattice, per segment so it erects top -> bottom
    const segCount = Math.max(5, Math.round((groundY - mastTopY) / (M * 0.92)));
    for (let i = 0; i < segCount; i++) {
      const y0 = mastTopY + (i * (groundY - mastTopY)) / segCount;
      const y1 = mastTopY + ((i + 1) * (groundY - mastTopY)) / segCount;
      addEdge([[railL, y0], [railL, y1]], { w: 1.6 });
      addEdge([[railR, y0], [railR, y1]], { w: 1.6 });
      addEdge([[railL, y0], [railR, y1]], { w: 0.8 });
      addEdge([[railR, y0], [railL, y1]], { w: 0.8 });
      if (i > 0) addEdge([[railL, y0], [railR, y0]], { w: 0.8 });
    }

    // 2 — CATHEAD apex above the mast (the stay tower)
    addEdge([[railL, mastTopY], [bx, apexY]], { w: 1.1 });
    addEdge([[railR, mastTopY], [bx, apexY]], { w: 1.1 });

    // 3 — measure the foreground wordmark so the JIB reaches it and the hook drops
    // onto the visible "staqpaq" (the logo IS the load). Fall back if absent.
    let hookX = bx - 5 * M;
    let hookEndY = mastTopY + 2.4 * M;
    const wm = document.querySelector('.ent-wordmark');
    if (wm && typeof document.createRange === 'function') {
      const range = document.createRange();
      range.selectNodeContents(wm); // tight glyph box (the h1 itself is full-width)
      const tr = range.getBoundingClientRect();
      const fr = this.getBoundingClientRect();
      if (tr.width > 10 && fr.width > 10) {
        hookX = tr.left + tr.width * 0.5 - fr.left;
        hookEndY = tr.top - fr.top - 6;
      }
    }
    hookEndY = clamp(hookEndY, mastTopY + 1.2 * M, groundY - M);

    // 4 — JIB (working arm) reaching LEFT past the wordmark, with stay cables
    const jibEndX = clamp(Math.min(bx - 3.5 * M, hookX - 0.8 * M), 0.9 * M, bx - 3 * M);
    addEdge([[railL, mastTopY], [jibEndX, mastTopY]], { w: 1.5 });
    addEdge([[jibEndX, mastTopY], [jibEndX, mastTopY + 0.4 * M]], { w: 0.9 });
    addEdge([[bx, apexY], [bx * 0.45 + jibEndX * 0.55, mastTopY]], { cable: true, w: 0.7 });
    addEdge([[bx, apexY], [jibEndX, mastTopY]], { cable: true, w: 0.7 });

    // 5 — TROLLEY + HOOK dropping onto the wordmark
    const trolleyX = clamp(hookX, jibEndX + 0.4 * M, bx - 0.8 * M);
    addEdge([[trolleyX - 8, mastTopY - 4], [trolleyX + 8, mastTopY - 4], [trolleyX + 8, mastTopY + 4], [trolleyX - 8, mastTopY + 4], [trolleyX - 8, mastTopY - 4]], { w: 0.9 });
    addEdge([[trolleyX, mastTopY + 4], [trolleyX, hookEndY]], { cable: true, w: 1.0 });
    addEdge([[trolleyX - 5, hookEndY], [trolleyX + 5, hookEndY]], { w: 1.0 }); // hook bar at the load

    // 5 — COUNTER-JIB + a solid counterweight slab (unlabeled) + backstay
    const cjEndX = clamp(bx + 2.6 * M, bx + 1.8 * M, W - 1.4 * M);
    addEdge([[railR, mastTopY], [cjEndX, mastTopY]], { w: 1.5 });
    addEdge([[bx, apexY], [cjEndX, mastTopY]], { cable: true, w: 0.7 });
    const cw = addNode(cjEndX - 9, mastTopY + 0.42 * M, false, null);
    cw.block = true;

    // 6 — BASE / foundation on the ground line
    addEdge([[bx - 1.5 * M, groundY], [bx + 1.5 * M, groundY]], { w: 1.6 });
    addEdge([[railL, groundY], [bx - 1.5 * M, groundY + 0.55 * M]], { w: 1.0 });
    addEdge([[railR, groundY], [bx + 1.5 * M, groundY + 0.55 * M]], { w: 1.0 });
    addEdge([[bx - 1.5 * M, groundY], [bx - 1.5 * M, groundY + 0.55 * M]], { w: 1.0 });
    addEdge([[bx + 1.5 * M, groundY], [bx + 1.5 * M, groundY + 0.55 * M]], { w: 1.0 });

    nodes.forEach((n, i) => { n.idx = i + 1; });

    // green signal climbs the mast, runs the jib, drops the hook to the wordmark
    const beamPath = [
      { pts: [P(railR, groundY), P(railR, mastTopY)] },
      { pts: [P(railR, mastTopY), P(trolleyX, mastTopY)] },
      { pts: [P(trolleyX, mastTopY), P(trolleyX, hookEndY)] },
    ];

    // frozen highlights at rest: the hook reaching the wordmark, jib, counter-jib
    const frozen = [
      { pts: [P(trolleyX, mastTopY + 4), P(trolleyX, hookEndY)], t: 0.82 },
      { pts: [P(railL, mastTopY), P(jibEndX, mastTopY)], t: 0.62 },
      { pts: [P(railR, mastTopY), P(cjEndX, mastTopY)], t: 0.7 },
    ];

    this._nodes = nodes;
    this._edges = edges;
    this._beamPath = beamPath;
    this._frozen = frozen;
  }

  // --- loop -----------------------------------------------------------------
  _tick(now) {
    if (!this._last) this._last = now;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._t += dt * this._warp;
    if (this._alpha < 1) this._alpha = Math.min(1, this._alpha + dt * 2.2);

    if (this._t >= REST) {
      this._t = REST;
      this._alpha = 1;
      this._drawFrame(REST, true);
      this._stopped = true;
      this._teardown();
      return;
    }
    this._ptr.x += (this._ptr.tx - this._ptr.x) * 0.06;
    this._ptr.y += (this._ptr.ty - this._ptr.y) * 0.06;
    this._drawFrame(this._t, false);
    this._raf = requestAnimationFrame(this._tick);
  }

  // --- draw -----------------------------------------------------------------
  _drawFrame(time, final) {
    const ctx = this._ctx;
    const W = this._w;
    const H = this._h;
    if (!ctx || W <= 1) return;
    const C = this._palette;
    const gA = final ? 1 : this._alpha;

    const scanP = final || this._stopped ? 1 : clamp((time - SCAN_START) / SCAN_DUR, 0, 1);
    const scanY = easeInOutCubic(scanP) * H;
    const revealY = scanP >= 1 ? H + 4 : scanY + 2;
    const settle = final ? 1 : clamp((time - SETTLE_START) / (SETTLE_END - SETTLE_START), 0, 1);

    // Opaque base painted to MATCH the configurator's body::before paper
    // (deep-blue ground + subtle well + light 24/120 grid + vignette). Opaque so
    // the animating canvas never forces a per-frame recomposite of the gradient
    // page background (that drops the entrance to ~1fps).
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${C.paperGround})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = gA;

    const FX = 0.5 * W;
    const FY = 0.46 * H;

    // L0a — central well (subtle lit belly, matches body::before)
    const well = ctx.createRadialGradient(FX, FY, 0, FX, FY, Math.max(W, H) * 0.6);
    well.addColorStop(0, `rgba(${C.signal},0.18)`);
    well.addColorStop(1, `rgba(${C.signal},0)`);
    ctx.fillStyle = well;
    ctx.fillRect(0, 0, W, H);

    // L0b — light datum grid (24 / 120), developed in the scan's wake
    this._drawGrid(ctx, W, H, revealY, C);

    // row flash riding the scanline
    if (scanP < 1) {
      ctx.strokeStyle = `rgba(${C.signal},${0.16 * gA})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(scanY) + 0.5);
      ctx.lineTo(W, Math.round(scanY) + 0.5);
      ctx.stroke();
    }

    // parallax (fades to 0 by settle so the rest frame is still)
    const par = (1 - settle) * (final ? 0 : 1);
    ctx.save();
    ctx.translate((this._ptr.x - 0.5) * 18 * par, (this._ptr.y - 0.5) * 14 * par);

    if (this.crane) {
      // L2 — crane structure (steel members + lighter stay cables), gated by the scan
      for (const e of this._edges) {
        if (!final && e.lowerY * H > revealY) continue;
        if (e.gateT < 0 && !final) e.gateT = time;
        const d = final ? 1 : clamp((time - e.gateT) / 0.26, 0, 1);
        const lw = e.w || 1.25;
        if (e.cable) {
          this._strokePolyline(ctx, e.pts, W, H, 0, 0, lw, `rgba(${C.steel},${0.5 * gA})`, d);
        } else {
          // faint embossed under-stroke on structural members
          this._strokePolyline(ctx, e.pts, W, H, 1, 1, Math.max(0.5, lw * 0.4), `rgba(${C.steel},${0.22 * gA})`, d);
          this._strokePolyline(ctx, e.pts, W, H, 0, 0, lw, `rgba(${C.steel},${0.85 * gA})`, d);
        }
      }

      // L3 — part-node ticket stamps (gated by the scan)
      for (const n of this._nodes) {
        if (!final && n.y * H > revealY) continue;
        if (n._gateT == null && !final) n._gateT = time;
        const s = final ? 1 : pop((time - (n._gateT ?? time)) / 0.22);
        this._drawStamp(ctx, n, s, gA, time, final, C);
      }

      // L4 — signal beam (traversing) then frozen highlights (at rest)
      if (!final && !this._stopped && time >= BEAM_START && this._beamPath.length) {
        const bp = clamp((time - BEAM_START) / BEAM_DUR, 0, 1);
        this._drawBeam(ctx, W, H, bp, gA, C);
      }
      this._drawFrozen(ctx, W, H, settle, gA, C);
    }

    ctx.restore();

    // L1 — power-on scanline (additive), entrance only
    if (scanP < 1) {
      ctx.globalCompositeOperation = 'lighter';
      const trail = ctx.createLinearGradient(0, scanY, 0, scanY + 110);
      trail.addColorStop(0, `rgba(${C.signal},${0.22 * gA})`);
      trail.addColorStop(1, `rgba(${C.signalDeep},0)`);
      ctx.fillStyle = trail;
      ctx.fillRect(0, scanY, W, 110);
      ctx.fillStyle = `rgba(${C.signal},${0.9 * gA})`;
      ctx.fillRect(0, Math.round(scanY) - 1, W, 2);
      // ignition seed flare just before the sweep
      if (time < SCAN_START + 0.25) {
        const f = 1 - clamp((time - SCAN_START) / 0.25, 0, 1);
        const fl = ctx.createRadialGradient(FX, FY, 0, FX, FY, 120);
        fl.addColorStop(0, `rgba(${C.signal},${0.5 * gA * f})`);
        fl.addColorStop(1, `rgba(${C.signal},0)`);
        ctx.fillStyle = fl;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // L5 — registration & doc chrome
    this._drawChrome(ctx, W, H, scanY, settle, gA, final, C);

    // L0c — corner vignette LAST (matches body::before, keeps corners legible)
    ctx.globalAlpha = 1;
    const vig = ctx.createRadialGradient(FX, FY, Math.min(W, H) * 0.32, FX, FY, Math.max(W, H) * 0.82);
    vig.addColorStop(0, 'rgba(0,3,16,0)');
    vig.addColorStop(1, 'rgba(0,3,16,0.78)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  _drawGrid(ctx, W, H, revealY, C) {
    const M = 24;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, Math.min(H, revealY));
    ctx.clip();
    ctx.lineWidth = 1;
    for (let i = 0, x = 0; x <= W; i++, x = i * M) {
      const major = i % 5 === 0;
      ctx.strokeStyle = major ? `rgba(${C.grid},0.10)` : `rgba(${C.grid},0.045)`;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
    }
    for (let i = 0, y = 0; y <= H; i++, y = i * M) {
      const major = i % 5 === 0;
      ctx.strokeStyle = major ? `rgba(${C.grid},0.10)` : `rgba(${C.grid},0.045)`;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  _strokePolyline(ctx, pts, W, H, ox, oy, lw, style, d) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot((pts[i][0] - pts[i - 1][0]) * W, (pts[i][1] - pts[i - 1][1]) * H);
    }
    const target = d * total;
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * W + ox, pts[0][1] * H + oy);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1][0] * W + ox, y0 = pts[i - 1][1] * H + oy;
      const x1 = pts[i][0] * W + ox, y1 = pts[i][1] * H + oy;
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (acc + seg <= target || d >= 1) {
        ctx.lineTo(x1, y1);
        acc += seg;
      } else {
        const r = (target - acc) / seg;
        ctx.lineTo(x0 + (x1 - x0) * r, y0 + (y1 - y0) * r);
        break;
      }
    }
    ctx.stroke();
  }

  _drawStamp(ctx, n, scale, gA, time, final, C) {
    const cx = Math.round(n.x * this._w);
    const cy = Math.round(n.y * this._h);

    // solid counterweight slab — a stacked-block mass, no text
    if (n.block) {
      const bw = Math.round(18 * scale);
      const bh = Math.round(26 * scale);
      const x = Math.round(cx - bw / 2);
      const y = Math.round(cy - bh / 2);
      ctx.globalAlpha = gA;
      ctx.fillStyle = `rgba(${C.ink3},0.96)`;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = `rgba(${C.steel},0.85)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      ctx.strokeStyle = `rgba(${C.steel},0.4)`;
      for (let yy = y + 6; yy < y + bh - 3; yy += 6) {
        ctx.beginPath();
        ctx.moveTo(x + 1, yy + 0.5);
        ctx.lineTo(x + bw - 1, yy + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = gA;
      return;
    }

    // size the box to fit its label + status dot so text never overflows
    const label = n.label != null ? n.label : (n.hero ? `BOM-${String(n.idx).padStart(3, '0')}` : String(n.idx).padStart(2, '0'));
    ctx.font = (n.hero || (n.label && n.label.length > 2)) ? '12px "Share Tech Mono", monospace' : '13px "VT323", monospace';
    ctx.textBaseline = 'middle';
    const padL = 6;
    const dotZone = 10;
    const tw = Math.ceil(ctx.measureText(label).width);
    const w = Math.max(n.hero ? 46 : 22, tw + padL + dotZone) * scale;
    const h = (n.hero ? 22 : 15) * scale;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    const rw = Math.round(w);
    const rh = Math.round(h);
    ctx.globalAlpha = gA;
    // plate
    ctx.fillStyle = `rgba(${C.ink2},0.96)`;
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeStyle = `rgba(${C.steel},0.85)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, rw - 1, rh - 1);
    // ticket L-corners
    const a = 6;
    ctx.strokeStyle = `rgba(${C.steel},1)`;
    ctx.beginPath();
    ctx.moveTo(x, y + a); ctx.lineTo(x, y); ctx.lineTo(x + a, y);
    ctx.moveTo(x + rw - a, y + rh); ctx.lineTo(x + rw, y + rh); ctx.lineTo(x + rw, y + rh - a);
    ctx.stroke();
    // label (only at near-full scale so a mid-pop stamp never clips text)
    if (scale > 0.85) {
      ctx.fillStyle = `rgba(${C.paperDim},0.92)`;
      ctx.fillText(label, x + padL, cy + (n.hero ? 0 : 1));
    }
    // status dot — ignite flash then rest
    const igniteT = n._gateT != null ? clamp((time - n._gateT) / 0.18, 0, 1) : 1;
    const flash = final ? 0 : (1 - igniteT) * 0.9;
    const restA = n.lit ? 0.65 : 0.3;
    const dotA = Math.max(restA, flash);
    const dotColor = n.lit || flash > 0.1 ? C.signal : C.paperFaint;
    ctx.fillStyle = `rgba(${dotColor},${dotA * gA})`;
    const ds = 3;
    ctx.fillRect(x + rw - dotZone + 2, cy - Math.floor(ds / 2), ds, ds);
    ctx.globalAlpha = gA;
  }

  _drawBeam(ctx, W, H, bp, gA, C) {
    // flatten the beam path into one polyline (px) with cumulative lengths
    const pts = [];
    for (const seg of this._beamPath) {
      for (const p of seg.pts) {
        const px = p[0] * W, py = p[1] * H;
        if (!pts.length || pts[pts.length - 1][0] !== px || pts[pts.length - 1][1] !== py) pts.push([px, py]);
      }
    }
    if (pts.length < 2) return;
    let total = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      cum.push(total);
    }
    const head = bp * total;
    const dash = 26;
    const at = (dist) => {
      const d = clamp(dist, 0, total);
      let i = 1;
      while (i < cum.length && cum[i] < d) i++;
      const a = pts[i - 1], b = pts[Math.min(i, pts.length - 1)];
      const segLen = (cum[Math.min(i, cum.length - 1)] - cum[i - 1]) || 1;
      const r = (d - cum[i - 1]) / segLen;
      return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
    };
    const p0 = at(head - dash);
    const p1 = at(head);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(${C.signal},0.15)`;
    // trail
    ctx.strokeStyle = `rgba(${C.signalDeep},${0.5 * gA})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const pt2 = at(head - dash * 2.4);
    ctx.moveTo(pt2[0], pt2[1]); ctx.lineTo(p0[0], p0[1]);
    ctx.stroke();
    // core
    ctx.strokeStyle = `rgba(${C.signal},${0.9 * gA})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawFrozen(ctx, W, H, settle, gA, C) {
    if (settle <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this._frozen) {
      // position along the polyline at parameter t
      const pts = f.pts;
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot((pts[i][0] - pts[i - 1][0]) * W, (pts[i][1] - pts[i - 1][1]) * H);
      const target = f.t * total;
      let acc = 0, px = pts[0][0] * W, py = pts[0][1] * H, dx = 1, dy = 0;
      for (let i = 1; i < pts.length; i++) {
        const x0 = pts[i - 1][0] * W, y0 = pts[i - 1][1] * H, x1 = pts[i][0] * W, y1 = pts[i][1] * H;
        const seg = Math.hypot(x1 - x0, y1 - y0) || 1;
        if (acc + seg >= target) {
          const r = (target - acc) / seg;
          px = x0 + (x1 - x0) * r; py = y0 + (y1 - y0) * r;
          dx = (x1 - x0) / seg; dy = (y1 - y0) / seg;
          break;
        }
        acc += seg;
      }
      const a = settle * gA;
      // halo
      ctx.shadowBlur = 10;
      ctx.shadowColor = `rgba(${C.signal},${0.3 * a})`;
      ctx.strokeStyle = `rgba(${C.signal},${0.9 * a})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - dx * 9, py - dy * 9);
      ctx.lineTo(px + dx * 9, py + dy * 9);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawChrome(ctx, W, H, scanY, settle, gA, final, C) {
    const inset = 28;
    const arm = 12;
    const marks = [
      [inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset],
    ];
    for (const [mx, my] of marks) {
      const p = final ? 1 : clamp((scanY - my) / 40 + 1, 0, 1);
      if (p <= 0) continue;
      ctx.strokeStyle = `rgba(${C.steel},${0.5 * gA * p})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - arm, my + 0.5); ctx.lineTo(mx + arm, my + 0.5);
      ctx.moveTo(mx + 0.5, my - arm); ctx.lineTo(mx + 0.5, my + arm);
      ctx.stroke();
    }
    // center crosshair
    const cp = final ? 1 : settle;
    if (cp > 0) {
      const FX = 0.5 * W, FY = 0.46 * H;
      ctx.strokeStyle = `rgba(${C.steel},${0.4 * gA * cp})`;
      ctx.beginPath();
      ctx.moveTo(FX - 8, FY + 0.5); ctx.lineTo(FX + 8, FY + 0.5);
      ctx.moveTo(FX + 0.5, FY - 8); ctx.lineTo(FX + 0.5, FY + 8);
      ctx.stroke();
    }
    // bezel
    ctx.strokeStyle = `rgba(${C.steel},${0.12 * gA})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(16.5, 16.5, W - 33, H - 33);
    // doc-id stamp, bottom-right, resolves on settle
    const da = final ? 1 : settle;
    if (da > 0) {
      ctx.font = '11px "Share Tech Mono", monospace';
      ctx.textBaseline = 'alphabetic';
      const okW = 16;
      ctx.fillStyle = `rgba(${C.paperDim},${0.85 * gA * da})`;
      ctx.fillText('SQ-FIELD · BOM-0001 · ', W - 28 - 160, H - 24);
      ctx.fillStyle = `rgba(${C.signal},${0.75 * gA * da})`;
      ctx.fillText('OK', W - 28 - okW, H - 24);
    }
  }
}

customElements.define('sq-spatial-field', SqSpatialField);
export { SqSpatialField };
