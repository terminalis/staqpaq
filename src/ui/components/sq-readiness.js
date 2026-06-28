// <sq-readiness> — the readiness meter: a 4px inset track with a rust fill and
// a VT323 percentage. (ui-manifest.yaml :: component_kit.customization)
//
// Presentation only. `pct` is a UI-only severity-weighted number computed by
// derive_requirements and passed in — this component never computes or persists
// it. (capabilities.yaml :: derive_requirements — readiness is UI-only.)

import { LitElement, html } from 'lit';

class SqReadiness extends LitElement {
  static properties = {
    pct: { type: Number },
    label: { type: String },
    meta: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.pct = 0;
    this.label = 'Pack readiness';
    this.meta = '';
  }

  render() {
    const w = Math.max(0, Math.min(100, Math.round(this.pct || 0)));
    return html`
      <div class="lab">${this.label}</div>
      <div class="pct vt" aria-hidden="true">${w}%</div>
      <div
        class="track"
        role="progressbar"
        aria-label=${this.label}
        aria-valuenow=${w}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span class="fill" style="width:${w}%"></span>
      </div>
      ${this.meta ? html`<div class="meta">${this.meta}</div>` : ''}
    `;
  }
}

customElements.define('sq-readiness', SqReadiness);
export { SqReadiness };
