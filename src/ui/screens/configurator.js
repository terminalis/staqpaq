// <sq-configurator> — the working bench (ux-design.yaml :: screens.configurator).
// Renders the ACTIVE section's applicable fields (from the catalogue projection)
// and collects intent. Projection only: it renders state + dispatches intent
// (via <sq-field>/<sq-option> events that bubble to the app) and holds no
// business logic, no gating evaluation, no canonical state.

import { LitElement, html } from 'lit';

class SqConfigurator extends LitElement {
  static properties = {
    section: { type: Object }, // a projected section view-model
    sectionIndex: { type: Number },
    sectionTotal: { type: Number },
    pct: { type: Number }, // this section's completion % (severity-weighted readiness)
  };

  createRenderRoot() {
    return this;
  }

  _nav(to) {
    this.dispatchEvent(new CustomEvent('sq-nav', { bubbles: true, composed: true, detail: { to } }));
  }

  render() {
    const s = this.section;
    if (!s) return html`<div class="cfg-panel"><div class="sq-empty">Select a section.</div></div>`;
    const last = this.sectionIndex >= this.sectionTotal - 1;
    const pct = Math.max(0, Math.min(100, Math.round(this.pct || 0)));
    return html`
      <div class="cfg-panel reading">
        <div class="crumb">
          <span class="on">configurator</span> / section ${s.number} / ${s.title.toLowerCase()}
        </div>

        <div class="panel-head">
          <div class="bignum vt">${s.number}</div>
          <div class="ht">
            <div class="of">section ${s.number} of ${this.sectionTotal}</div>
            <h2 class="vt">${s.title}</h2>
            ${s.blurb ? html`<p class="desc">${s.blurb}</p>` : ''}
          </div>
        </div>
        <div class="head-rule-row">
          <sq-beamrule
            class="head-rule"
            style="--sq-pct:${pct}%"
            ?data-complete=${pct >= 100}
          ></sq-beamrule>
          <span class="head-rule-pct vt">${pct}%</span>
        </div>

        <div class="req-legend">
          <abbr class="req-mark" title="Recommended">*</abbr> Recommended — the decisions most builds should lock in
        </div>

        <sq-ticket class="cfg-frame">
          ${s.fields.length
            ? s.fields.map((f) => html`<sq-field .field=${f}></sq-field>`)
            : html`<div class="sq-empty">No applicable fields in this section under the current selections.</div>`}
        </sq-ticket>

        <div class="panel-foot">
          <span class="step">${s.number} / ${this.sectionTotal} · autosaved</span>
          <span class="spacer"></span>
          <div class="panel-nav-actions">
            ${this.sectionIndex > 0
              ? html`<button class="btn ghost" @click=${() => this._nav('prev')}>
                  <sq-icon name="solar:arrow-left-linear"></sq-icon> Back
                </button>`
              : ''}
            <button class="btn primary" @click=${() => this._nav('next')}>
              ${last ? 'Review & Export' : 'Next'}
              <sq-icon name="solar:arrow-right-bold"></sq-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('sq-configurator', SqConfigurator);
export { SqConfigurator };
