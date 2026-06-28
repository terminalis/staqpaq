// <sq-entrance> — the front-door manifest cover (ux-design.yaml :: screens.entrance).
// Frames the instrument and the select -> derive -> export pipeline; offers the
// two entry actions. Sits OUTSIDE the workspace shell. Presentation only: it
// dispatches sq-nav (start) and sq-load-sample; it holds no authority.

import { LitElement, html } from 'lit';

class SqEntrance extends LitElement {
  createRenderRoot() {
    return this;
  }

  _nav(to) {
    this.dispatchEvent(new CustomEvent('sq-nav', { bubbles: true, composed: true, detail: { to } }));
  }

  _loadSample() {
    this.dispatchEvent(new CustomEvent('sq-load-sample', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <section id="main-content" class="entrance" role="main" tabindex="-1">
        <sq-spatial-field></sq-spatial-field>

        <div class="ent-wrap">
          <h1 class="ent-wordmark vt"><span>staq</span><span class="signal">paq</span></h1>

          <p class="ent-promise">
            Stamp the parts of an app build onto a <b>bill of materials</b>, export your stack
            pack, and pass it to your preferred AI coding tool.
          </p>

          <div class="ent-cta">
            <button class="btn primary" @click=${() => this._nav('configurator')}>
              <sq-icon name="solar:bolt-circle-bold"></sq-icon> generate staqpaq
            </button>
            <button class="btn ghost" @click=${this._loadSample}>
              <sq-icon name="solar:folder-with-files-bold"></sq-icon> Load sample
            </button>
          </div>

          <div class="ent-howto">
            <span class="eyebrow ent-howto-label">How it works</span>
            <p>
              Work through focused sections — frameworks, data, auth, payments, and more —
              answering only the decisions your build actually needs. Staqpaq keeps
              track of what's still open as you go, so nothing important slips through.
            </p>
          </div>

          <div class="ent-foot">
            <span class="eyebrow">app stack · bill of materials</span>
            <span class="eyebrow">Configure · Build · Manifest</span>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('sq-entrance', SqEntrance);
export { SqEntrance };
