// <sq-option> — a bordered surface chip with an 11px box that fills rust when
// selected (NOT a checkbox/radio, NOT an icon-card). Gated options are shown
// dashed + struck + faded with their reason in a keyboard-reachable, aria-
// exposed tooltip — never hidden. (ui-manifest.yaml :: component_kit.customization)
//
// Presentation only: it renders state from properties and DISPATCHES intent
// (`sq-option-activate`) when the user picks it. It evaluates no gating and
// calls no capability — the screen wires the event to runIntent. Gated options
// never dispatch (the reason explains why); the orchestrator remains the only
// authority. (build-contract.md :: The fence)

import { LitElement, html } from 'lit';

let _uid = 0;

class SqOption extends LitElement {
  static properties = {
    optionKey: { type: String, attribute: 'option-key' },
    label: { type: String },
    icon: { type: String },
    iconColor: { type: String, attribute: 'icon-color' },
    iconPlaceholder: { type: Boolean, attribute: 'icon-placeholder' },
    controlRole: { type: String, attribute: 'control-role' },
    selected: { type: Boolean, reflect: true },
    gated: { type: Boolean, reflect: true },
    // muted: a non-selected option in a single_select field where one is already
    // chosen — faded/crosshatched like gated, but still clickable and unlabelled.
    muted: { type: Boolean, reflect: true },
    reason: { type: String },
  };

  createRenderRoot() {
    return this; // light DOM — styled by the global token CSS
  }

  constructor() {
    super();
    this.selected = false;
    this.gated = false;
    this.muted = false;
    this.controlRole = 'button';
    this.iconPlaceholder = false;
    this._tipId = `sq-opt-tip-${++_uid}`;
    this._onActivate = this._onActivate.bind(this);
    this._onKey = this._onKey.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this._syncA11y();
    this.addEventListener('click', this._onActivate);
    this.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onActivate);
    this.removeEventListener('keydown', this._onKey);
    super.disconnectedCallback();
  }

  _onActivate() {
    if (this.gated) return; // selecting a gated option is precluded — reason shown instead
    this.dispatchEvent(
      new CustomEvent('sq-option-activate', {
        bubbles: true,
        composed: true,
        detail: { optionKey: this.optionKey },
      }),
    );
  }

  _onKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onActivate();
    }
  }

  _syncA11y() {
    const role = this.controlRole || 'button';
    this.setAttribute('role', role);
    if (role === 'radio' || role === 'checkbox') {
      this.setAttribute('aria-checked', String(!!this.selected));
    } else {
      this.removeAttribute('aria-checked');
    }
    if (this.gated) {
      this.setAttribute('aria-disabled', 'true');
      this.setAttribute('aria-describedby', this._tipId);
    } else {
      this.removeAttribute('aria-disabled');
      this.removeAttribute('aria-describedby');
    }
  }

  updated() {
    this._syncA11y();
  }

  render() {
    const iconStyle = this.iconColor ? `color:${this.iconColor}` : '';
    return html`
      ${this.icon
        ? html`<sq-icon class="lg" name=${this.icon} style=${iconStyle}></sq-icon>`
        : this.iconPlaceholder
          ? html`<span class="opt-icon-placeholder lg" aria-hidden="true"></span>`
        : ''}
      <span class="opt-label">${this.label}</span>
      ${this.gated
        ? html`
            <span class="gflag">gated</span>
            <span class="tip" id=${this._tipId} role="tooltip">
              <b>Gated.</b> ${this.reason}
            </span>
          `
        : ''}
    `;
  }
}

customElements.define('sq-option', SqOption);
export { SqOption };
