// <sq-modal> — the confirmation shell for destructive actions (reset; load-
// overwrite). It only PRESENTS a confirm/cancel choice and dispatches
// sq-modal-confirm / sq-modal-cancel; the actual confirmation policy + token are
// enforced by the orchestrator. Presentation only, no authority.
// (ux-design.yaml :: edge_states — destructive actions use a modal confirmation)

import { LitElement, html } from 'lit';

class SqModal extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    title: { type: String },
    body: { type: String },
    confirmLabel: { type: String, attribute: 'confirm-label' },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.open = false;
    this._previousFocus = null;
    this._inerted = [];
    this._onKey = this._onKey.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this._onKey);
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._onKey);
    this._releaseFocus();
    super.disconnectedCallback();
  }

  _onKey(e) {
    if (!this.open) return;
    if (e.key === 'Escape') this._emit('sq-modal-cancel');
    if (e.key === 'Tab') this._trapFocus(e);
  }

  _emit(name) {
    this._releaseFocus();
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  firstUpdated() {
    if (this.open) this._activateFocus();
  }

  updated(changed) {
    if (!changed.has('open')) return;
    if (this.open) this._activateFocus();
    else this._releaseFocus();
  }

  _focusable() {
    return Array.from(
      this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return !el.disabled && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  _activateFocus() {
    if (!this._previousFocus) this._previousFocus = document.activeElement;
    this._setBackgroundInert(true);
    queueMicrotask(() => this._focusFirst());
  }

  _focusFirst() {
    const first = this._focusable()[0] || this.querySelector('[role="dialog"]');
    if (first) first.focus();
  }

  _trapFocus(e) {
    const focusable = this._focusable();
    if (focusable.length === 0) {
      e.preventDefault();
      this._focusFirst();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _setBackgroundInert(inert) {
    if (!inert) {
      for (const item of this._inerted) {
        item.el.inert = item.inert;
        if (item.ariaHidden == null) item.el.removeAttribute('aria-hidden');
        else item.el.setAttribute('aria-hidden', item.ariaHidden);
      }
      this._inerted = [];
      return;
    }
    const parent = this.parentElement;
    if (!parent) return;
    if (inert && this._inerted.length === 0) {
      for (const el of Array.from(parent.children)) {
        if (el === this) continue;
        this._inerted.push({
          el,
          inert: el.inert,
          ariaHidden: el.getAttribute('aria-hidden'),
        });
        el.inert = inert;
        el.setAttribute('aria-hidden', 'true');
      }
      return;
    }
  }

  _releaseFocus() {
    this._setBackgroundInert(false);
    const target = this._previousFocus;
    this._previousFocus = null;
    if (target && target.isConnected && typeof target.focus === 'function') {
      target.focus();
    }
  }

  render() {
    if (!this.open) return html``;
    return html`
      <div
        class="sq-modal-backdrop"
        @click=${(e) => { if (e.target === e.currentTarget) this._emit('sq-modal-cancel'); }}
      >
        <sq-ticket class="sq-modal" role="dialog" aria-modal="true" aria-label=${this.title || 'Confirm'} tabindex="-1">
          <div class="m-title vt">${this.title}</div>
          <p class="m-body">${this.body}</p>
          <div class="m-actions">
            <button class="btn ghost" @click=${() => this._emit('sq-modal-cancel')}>Cancel</button>
            <button class="btn primary" @click=${() => this._emit('sq-modal-confirm')}>
              ${this.confirmLabel || 'Confirm'}
            </button>
          </div>
        </sq-ticket>
      </div>
    `;
  }
}

customElements.define('sq-modal', SqModal);
export { SqModal };
