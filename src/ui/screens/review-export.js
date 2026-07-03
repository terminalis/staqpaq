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
    sectionOf: { type: Object }, // field path -> owning section id (view-model map)
    toast: { type: Object }, // { kind: 'ok'|'error', text } | null
  };

  createRenderRoot() {
    return this;
  }

  _export(scope) {
    this.dispatchEvent(new CustomEvent('sq-export', { bubbles: true, composed: true, detail: { scope } }));
  }

  _openRecommendation(m) {
    const to = (this.sectionOf || {})[m.path];
    if (!to) return;
    this.dispatchEvent(new CustomEvent('sq-nav', { bubbles: true, composed: true, detail: { to, focusPath: m.path } }));
  }

  _dismissToast() {
    this.dispatchEvent(new CustomEvent('sq-toast-dismiss', { bubbles: true, composed: true }));
  }

  _readinessMeta(req) {
    const total = req.readiness.per_section.length;
    const done = req.readiness.per_section.filter((p) => p.pct === 100).length;
    const reqd = req.missing_decisions.filter((m) => m.severity === 'recommended').length;
    return `${done} of ${total} sections · ${reqd} open recommendation${reqd === 1 ? '' : 's'}`;
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
            <div class="block-eyebrow eyebrow">Open recommendations</div>
            <p class="block-hint">Suggested by the catalogue — leave open if not relevant. Tap one to jump to it.</p>
            ${req.missing_decisions.length
              ? html`<div class="misslist">
                  ${req.missing_decisions.map(
                    (m) => html`<button
                      type="button"
                      class="miss"
                      title=${`Go to ${m.label}`}
                      @click=${() => this._openRecommendation(m)}
                    >
                      <sq-stamp variant=${m.severity}>${m.severity}</sq-stamp>
                      <span class="miss-label">${m.label}</span>
                      <sq-icon class="miss-go" name="solar:arrow-right-linear" aria-hidden="true"></sq-icon>
                    </button>`,
                  )}
                </div>`
              : html`<div class="sq-empty">Nothing open — all recommendations are decided.</div>`}
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
              : html`<div class="sq-empty">None yet — implied as you make selections.</div>`}
          </div>
          <div class="derived-col">
            <div class="block-eyebrow eyebrow">Implied env vars</div>
            ${req.implied_env_vars.length
              ? html`<ul class="dlist">${req.implied_env_vars.map((e) => html`<li><code>${e.key}</code> <span class="faint">${e.from_provider}</span></li>`)}</ul>`
              : html`<div class="sq-empty">None yet — appears as you pick providers.</div>`}
          </div>
          <div class="derived-col">
            <div class="block-eyebrow eyebrow">Provider implications</div>
            ${req.provider_implications.length
              ? html`<ul class="dlist">${req.provider_implications.map((i) => html`<li>${i.note}</li>`)}</ul>`
              : html`<div class="sq-empty">None yet — appears as you pick providers.</div>`}
          </div>
        </div>

        <div class="filelist">
          <div class="f"><sq-icon name="solar:document-text-bold" style="color:var(--signal)"></sq-icon><span class="nm">staqpaq.yaml</span><span class="canon">canonical</span></div>
          <div class="f"><sq-icon name="solar:document-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">staqpaq.md</span><span class="tag">companion</span></div>
          <div class="f"><sq-icon name="solar:checklist-minimalistic-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">asset-checklist.md</span><span class="tag">companion</span></div>
          <div class="f"><sq-icon name="solar:settings-bold" style="color:var(--paper-dim)"></sq-icon><span class="nm">.env.example</span><span class="tag">companion</span></div>
        </div>

        <div class="export-bar">
          <button class="btn primary" @click=${() => this._export('yaml')}>
            <sq-icon name="solar:download-minimalistic-bold"></sq-icon> Download staqpaq.yaml
          </button>
          <button class="btn ghost" @click=${() => this._export('pack')}>
            <sq-icon name="solar:archive-down-minimlistic-bold"></sq-icon> Full pack zip
          </button>
          <div class="sq-toast-region" role="status">
            ${this.toast && this.toast.text
              ? html`<span class="sq-toast" data-kind=${this.toast.kind || 'ok'}>
                  <sq-icon name=${this.toast.kind === 'error' ? 'solar:close-circle-linear' : 'solar:check-circle-bold'}></sq-icon>
                  ${this.toast.text}
                  <button class="toast-x" type="button" aria-label="Dismiss notification" @click=${this._dismissToast}>✕</button>
                </span>`
              : ''}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('sq-review-export', SqReviewExport);
export { SqReviewExport };
