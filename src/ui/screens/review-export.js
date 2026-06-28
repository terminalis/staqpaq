// <sq-review-export> — the inspection & dispatch bench (ux-design.yaml ::
// screens.review_export). Renders readiness, missing decisions, the derived
// requirements, the live staqpaq.yaml preview, the file list, and the export
// bar. Projection only: it renders the derived read-model + the inert preview
// string and dispatches sq-export (passing only a scope). The recompute loop +
// commit wiring are tightened in Step 12; the preview holds no authority.

import { LitElement, html } from 'lit';

class SqReviewExport extends LitElement {
  static properties = {
    requirements: { type: Object },
    yaml: { type: String },
    sectionTitles: { type: Object },
    toast: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  _export(scope) {
    this.dispatchEvent(new CustomEvent('sq-export', { bubbles: true, composed: true, detail: { scope } }));
  }

  _readinessMeta(req) {
    const total = req.readiness.per_section.length;
    const done = req.readiness.per_section.filter((p) => p.pct === 100).length;
    const reqd = req.missing_decisions.filter((m) => m.severity === 'recommended').length;
    return `${done} of ${total} sections · ${reqd} recommended gap${reqd === 1 ? '' : 's'}`;
  }

  render() {
    const req = this.requirements || {
      readiness: { overall_pct: 0, per_section: [] },
      missing_decisions: [], required_assets: [], implied_env_vars: [], provider_implications: [],
    };
    const titles = this.sectionTitles || {};

    return html`
      <div class="rev-panel reading">
        <div class="crumb"><span class="on">review &amp; export</span> / pack</div>

        <div class="rev-cols">
          <div class="rev-block">
            <div class="block-eyebrow eyebrow">Readiness</div>
            <sq-readiness .pct=${req.readiness.overall_pct} meta=${this._readinessMeta(req)}></sq-readiness>
            <div class="scorebars">
              ${req.readiness.per_section.map(
                (ps) => html`
                  <div class="sb">
                    <span class="nm">${titles[ps.section_id] || ps.section_id}</span>
                    <span class="vv vt">${ps.pct}</span>
                    <span class="tr"><span class="fl" style="width:${ps.pct}%"></span></span>
                  </div>
                `,
              )}
            </div>
          </div>

          <div class="rev-block">
            <div class="block-eyebrow eyebrow">Missing decisions</div>
            ${req.missing_decisions.length
              ? html`<div class="misslist">
                  ${req.missing_decisions.map(
                    (m) => html`<div class="miss">
                      <sq-stamp variant="required">${m.severity}</sq-stamp>
                      <span class="miss-label">${m.label}</span>
                    </div>`,
                  )}
                </div>`
              : html`<div class="sq-empty">All recommended decisions are resolved.</div>`}
          </div>
        </div>

        <div class="rev-yaml">
          <sq-yaml-preview .value=${this.yaml || ''}></sq-yaml-preview>
        </div>

        <div class="rev-derived">
          <div class="derived-col">
            <div class="block-eyebrow eyebrow">Required brand assets</div>
            ${req.required_assets.length
              ? html`<ul class="dlist">${req.required_assets.map((a) => html`<li><sq-icon name=${a.have ? 'solar:check-circle-bold' : 'solar:gallery-bold'}></sq-icon> ${a.label} <span class="faint">${a.filename_hint}</span> <span class="faint">${a.have ? '· have' : '· need'}</span></li>`)}</ul>`
              : html`<div class="sq-empty">None implied yet.</div>`}
          </div>
          <div class="derived-col">
            <div class="block-eyebrow eyebrow">Implied env vars</div>
            ${req.implied_env_vars.length
              ? html`<ul class="dlist">${req.implied_env_vars.map((e) => html`<li><code>${e.key}</code> <span class="faint">${e.from_provider}</span></li>`)}</ul>`
              : html`<div class="sq-empty">None implied yet.</div>`}
          </div>
          <div class="derived-col">
            <div class="block-eyebrow eyebrow">Provider implications</div>
            ${req.provider_implications.length
              ? html`<ul class="dlist">${req.provider_implications.map((i) => html`<li>${i.note}</li>`)}</ul>`
              : html`<div class="sq-empty">None yet.</div>`}
          </div>
        </div>

        <div class="filelist">
          <div class="f"><sq-icon name="solar:document-text-bold" style="color:var(--signal)"></sq-icon><span class="nm">staqpaq.yaml</span><span class="canon">canonical</span></div>
          <div class="f"><sq-icon name="solar:document-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">staqpaq.md</span><span class="tag">companion</span></div>
          <div class="f"><sq-icon name="solar:checklist-minimalistic-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">asset-checklist.md</span><span class="tag">companion</span></div>
          <div class="f"><sq-icon name="solar:list-check-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">missing-decisions.md</span><span class="tag">companion</span></div>
          <div class="f"><sq-icon name="solar:settings-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">.env.example</span><span class="tag">companion</span></div>
        </div>

        <div class="export-bar">
          <button class="btn primary" @click=${() => this._export('yaml')}>
            <sq-icon name="solar:download-minimalistic-bold"></sq-icon> Download staqpaq.yaml
          </button>
          <button class="btn ghost" @click=${() => this._export('pack')}>
            <sq-icon name="solar:archive-down-minimlistic-bold"></sq-icon> Full pack zip
          </button>
          ${this.toast ? html`<span class="sq-toast"><sq-icon name="solar:check-circle-bold"></sq-icon> ${this.toast}</span>` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('sq-review-export', SqReviewExport);
export { SqReviewExport };
