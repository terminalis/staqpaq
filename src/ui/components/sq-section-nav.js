// <sq-section-nav> — the shared workspace navigator. On desktop it is a vertical
// section rail. On mobile it collapses to a compact position bar (‹ prev · current
// section · next ›) whose centre opens a full-screen section index — large rows you
// can tap to jump anywhere, with done-checks and per-section %. VT323 numerals, a
// luminous active marker, a sage done-check. Dispatches sq-nav.
// Presentation only — it collects navigation intent and holds no authority.
// (ux-design.yaml :: navigation; ui-manifest.yaml :: component_kit.customization)

import { LitElement, html, nothing } from 'lit';

class SqSectionNav extends LitElement {
  static properties = {
    items: { type: Array }, // [{ id, number, title, done, pct }]
    active: { type: String },
    _open: { state: true }, // mobile section-index sheet open?
  };

  constructor() {
    super();
    this.items = [];
    this.active = '';
    this._open = false;
  }

  createRenderRoot() {
    return this;
  }

  _go(to) {
    this.dispatchEvent(new CustomEvent('sq-nav', { bubbles: true, composed: true, detail: { to } }));
  }

  _pick(id) {
    this._open = false;
    this._go(id);
  }

  _openSheet() {
    this._open = true;
  }

  _closeSheet() {
    this._open = false;
  }

  updated(changed) {
    if (!changed.has('_open')) return;
    if (this._open) {
      // move focus into the sheet (active row, else the first row)
      const el =
        this.querySelector('.secsheet-list .navitem.active') ||
        this.querySelector('.secsheet-list .navitem');
      if (el) el.focus();
    } else if (changed.get('_open') === true) {
      // returning from the sheet: restore focus to the trigger
      const btn = this.querySelector('.secbar-cur');
      if (btn) btn.focus();
    }
  }

  _rowTpl(it, mode = 'nav') {
    const isReview = it.id === 'review';
    const selected = it.id === this.active;
    return html`
      <li>
        <button
          type="button"
          class="navitem ${selected ? 'active' : ''} ${it.done ? 'done' : ''}"
          aria-current=${selected ? 'step' : nothing}
          @click=${() => (mode === 'sheet' ? this._pick(it.id) : this._go(it.id))}
        >
          <span class="sn vt">${it.number}</span>
          <span class="nm">${it.title}</span>
          ${isReview ? '' : html`<span class="nn vt">${it.resolved}/${it.total}</span>`}
        </button>
      </li>
    `;
  }

  render() {
    const items = this.items || [];
    const idx = items.findIndex((it) => it.id === this.active);
    const cur = idx >= 0 ? items[idx] : items[0];
    const total = items.length;
    const isFirst = idx <= 0;

    return html`
      <!-- desktop: vertical section rail -->
      <nav class="section-nav" aria-label="Sections">
        <ol class="seclist">
          ${items.map((it) => this._rowTpl(it))}
        </ol>
      </nav>

      <!-- mobile: compact position bar -->
      <div class="secbar">
        <button
          class="secbar-step"
          ?disabled=${isFirst}
          aria-label="Previous section"
          @click=${() => this._go('prev')}
        >
          <sq-icon name="solar:arrow-left-linear"></sq-icon>
        </button>
        <button
          class="secbar-cur"
          aria-haspopup="dialog"
          aria-expanded=${this._open ? 'true' : 'false'}
          @click=${this._openSheet}
        >
          <span class="sn vt">${cur ? cur.number : ''}</span>
          <span class="secbar-tt">
            <span class="nm">${cur ? cur.title : ''}</span>
            <span class="cnt">${idx >= 0 ? idx + 1 : 1} / ${total} · tap to jump</span>
          </span>
          <sq-icon class="chev" name="solar:alt-arrow-down-linear"></sq-icon>
        </button>
        <button
          class="secbar-step"
          aria-label="Next section"
          @click=${() => this._go('next')}
        >
          <sq-icon name="solar:arrow-right-linear"></sq-icon>
        </button>
      </div>

      <!-- mobile: full-screen section index sheet -->
      ${this._open
        ? html`
            <div class="secsheet" @keydown=${(e) => { if (e.key === 'Escape') this._closeSheet(); }}>
              <div class="secsheet-panel" role="dialog" aria-modal="true" aria-label="Sections">
                <div class="secsheet-head">
                  <span class="label">Sections</span>
                  <button class="secsheet-close" aria-label="Close" @click=${this._closeSheet}>
                    <sq-icon name="solar:close-circle-linear"></sq-icon>
                  </button>
                </div>
                <ol class="secsheet-list" aria-label="Jump to section">
                  ${items.map((it) => this._rowTpl(it, 'sheet'))}
                </ol>
              </div>
            </div>
          `
        : ''}
    `;
  }
}

customElements.define('sq-section-nav', SqSectionNav);
export { SqSectionNav };
