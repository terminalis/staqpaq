// <sq-app> — the root view. Boots the logic layer, holds the in-page view state
// (entrance <-> workspace; section <-> review), and routes EVERY user action
// through the orchestrator façade. No router (in-page switching). After each
// capability it re-reads the façade (the recompute loop) and re-renders.
//
// Authority-thin by construction: it renders state + collects intent and invokes
// runIntent via the façade. It imports the façade + pure read helpers ONLY —
// never the state module, the capability handlers, or the persistence library
// (assert-no-ui-logic / assert-no-direct-db-access).

import { LitElement, html } from 'lit';
import * as facade from '../core/orchestrator/facade.js';
import { downloadPack } from './download.js';
import './components/sq-elements.js';
import './components/sq-section-nav.js';
import './components/sq-modal.js';
import './screens/configurator.js';
import './screens/review-export.js';

const CONFIRM_COPY = {
  reset_draft: {
    title: 'Reset draft?',
    body: 'This clears every decision and starts an empty staqpaq. This cannot be undone.',
    confirmLabel: 'Reset draft',
  },
};

class SqApp extends LitElement {
  static properties = {
    _active: { state: true }, // section id | 'review'
    _m: { state: true }, // read-model snapshot
    _modal: { state: true }, // { capabilityId, input, token } | null
    _projectPrompt: { state: true },
    _projectPromptError: { state: true },
    _toast: { state: true },
    _booted: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._active = null;
    this._m = null;
    this._modal = null;
    this._projectPrompt = false;
    this._projectPromptError = '';
    this._toast = '';
    this._booted = false;
  }

  updated(changed) {
    if (changed.has('_active') && changed.get('_active') !== this._active) {
      this._scrollWorkspaceTop();
    }
  }

  _scrollWorkspaceTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  async connectedCallback() {
    super.connectedCallback();
    this.addEventListener('sq-record', (e) => this._run('record_selection', { path: e.detail.path, option_key: e.detail.optionKey }));
    this.addEventListener('sq-field-input', (e) => this._run('set_custom_value', { path: e.detail.path, value: e.detail.value }));
    this.addEventListener('sq-field-custom', (e) => this._run('set_custom_value', { path: e.detail.path, value: e.detail.value, values: e.detail.values }));
    this.addEventListener('sq-field-clear', (e) => this._run('clear_selection', { path: e.detail.path }));
    this.addEventListener('sq-nav', (e) => this._onNav(e.detail.to));
    this.addEventListener('sq-reset', () => this._run('reset_draft', {}));
    this.addEventListener('sq-export', (e) => this._onExport(e.detail.scope));
    this.addEventListener('sq-modal-confirm', (e) => this._onModalConfirm(e));
    this.addEventListener('sq-modal-cancel', () => {
      if (this._projectPrompt) {
        this._projectPrompt = false;
        this._projectPromptError = '';
      }
      else this._modal = null;
    });

    await facade.boot();
    this.refresh();
    if (this._active == null) this._active = this._firstSectionId();
    this._booted = true;
  }

  refresh() {
    this._m = {
      entity: facade.readEntity(),
      catalogueView: facade.readCatalogueView(),
      requirements: facade.readRequirements(),
      yaml: facade.readPreviewYaml(),
    };
  }

  _firstSectionId() {
    return (this._m && this._m.catalogueView.sections[0] && this._m.catalogueView.sections[0].id) || 'review';
  }

  async _run(capabilityId, input) {
    const res = await facade.invokeIntent(capabilityId, input);
    if (!res.ok && res.error && res.error.code === 'CONFIRMATION_REQUIRED') {
      this._modal = { capabilityId, input, token: res.error.confirmationToken };
      return;
    }
    this._afterMutation(capabilityId, res);
  }

  async _onModalConfirm(e) {
    if (this._projectPrompt) {
      const value = e.detail && typeof e.detail.value === 'string' ? e.detail.value.trim() : '';
      if (!value) {
        this._projectPromptError = 'Project name is required.';
        return;
      }
      this._projectPrompt = false;
      this._projectPromptError = '';
      await this._run('set_custom_value', { path: 'project.name', value });
      return;
    }
    const m = this._modal;
    if (!m) return;
    const res = await facade.invokeIntent(m.capabilityId, m.input, m.token);
    this._modal = null;
    this._afterMutation(m.capabilityId, res);
  }

  _afterMutation(capabilityId, res) {
    if (!res.ok) return;
    this.refresh();
    if (capabilityId === 'reset_draft') {
      this._active = this._firstSectionId();
    }
    this._ensureActiveValid();
  }

  _onNav(to) {
    if (to === 'configurator') {
      if (!this._active || this._active === 'review') this._active = this._firstSectionId();
      return;
    }
    if (to === 'review') { this._active = 'review'; return; }
    if (to === 'next' || to === 'prev') { this._step(to); return; }
    // an explicit section id
    this._active = to;
  }

  _step(dir) {
    const secs = this._m.catalogueView.sections;
    const idx = secs.findIndex((s) => s.id === this._active);
    if (dir === 'next') {
      this._active = idx >= 0 && idx < secs.length - 1 ? secs[idx + 1].id : 'review';
    } else if (idx > 0) {
      this._active = secs[idx - 1].id;
    }
  }

  _ensureActiveValid() {
    if (this._active === 'review') return;
    const secs = this._m.catalogueView.sections;
    if (!secs.find((s) => s.id === this._active)) this._active = this._firstSectionId();
  }

  async _onExport(scope) {
    const res = await facade.invokeIntent('export_pack', { scope }); // passes ONLY scope
    if (res.ok) {
      downloadPack(res.result);
      this._toast = scope === 'pack' ? 'Pack exported' : 'staqpaq.yaml exported';
      this.requestUpdate();
      window.setTimeout(() => { this._toast = ''; this.requestUpdate(); }, 2600);
    }
  }

  _sectionPct(id) {
    const ps = this._m.requirements.readiness.per_section.find((p) => p.section_id === id);
    return ps ? ps.pct : 0;
  }

  _openProjectPrompt() {
    this._projectPrompt = true;
    this._projectPromptError = '';
  }

  _renderModal() {
    if (this._projectPrompt) {
      const name = (this._m && (this._m.entity.selections['project.name'] || this._m.entity.selections['project.name.custom'])) || '';
      return html`<sq-modal
        open
        prompt
        title="Edit project name"
        body="Add or change the name used in the manifest and exported pack."
        input-label="Project name"
        placeholder="e.g. Acme Analytics"
        value=${name}
        error=${this._projectPromptError}
        confirm-label="Save name"
      ></sq-modal>`;
    }
    if (!this._modal) return html``;
    const copy = CONFIRM_COPY[this._modal.capabilityId] || { title: 'Confirm?', body: '', confirmLabel: 'Confirm' };
    return html`<sq-modal open title=${copy.title} body=${copy.body} confirm-label=${copy.confirmLabel}></sq-modal>`;
  }

  _renderSkipLink() {
    return html`<a class="skip-link" href="#main-content">Skip to main content</a>`;
  }

  _renderWorkspace() {
    const m = this._m;
    const sectionTitles = {};
    for (const s of m.catalogueView.sections) sectionTitles[s.id] = s.title;
    const items = m.catalogueView.sections.map((s) => ({
      id: s.id, number: s.number, title: s.title,
      resolved: s.resolvedCount, total: s.fieldCount,
      done: s.fieldCount > 0 && s.resolvedCount === s.fieldCount,
    }));
    items.push({ id: 'review', number: '→', title: 'Review & Export', done: false });
    const activeSection = m.catalogueView.sections.find((s) => s.id === this._active);
    const projectName = m.entity.selections['project.name'] || m.entity.selections['project.name.custom'];
    const overallPct = Math.round(m.requirements.readiness.overall_pct || 0);
    const sheetLabel = this._active === 'review'
      ? 'review'
      : `${activeSection ? activeSection.number : '—'} / ${m.catalogueView.sections.length}`;

    return html`
      <div class="workspace" data-enter>
        <div class="scanline" aria-hidden="true"></div>
        <div class="workspace-reveal">
        <aside class="shell-rail">
          <div class="bp-titleblock">
            <a
              class="tb-brand"
              href="https://github.com/terminalis/staqpaq"
              target="_blank"
              rel="noopener"
              title="View source on GitHub"
              aria-label="staqpaq — view source on GitHub"
            >
              <span class="tb-mark vt">staq<span class="signal">paq</span></span>
              <span class="tb-meta">build manifest</span>
            </a>
            <div class="tb-grid">
              <button
                class="tb-cell tb-project"
                type="button"
                title="Add or change project name"
                aria-label="Add or change project name"
                @click=${this._openProjectPrompt}
              >
                <span class="tb-k">project</span><span class="tb-v">${projectName || 'untitled'}</span>
              </button>
              <div class="tb-cell"><span class="tb-k">sheet</span><span class="tb-v">${sheetLabel}</span></div>
              <div class="tb-cell"><span class="tb-k">readiness</span><span class="tb-v">${overallPct}%</span></div>
            </div>
          </div>
          <div class="rail-actions">
            <button class="btn ghost rail-reset" @click=${() => this._run('reset_draft', {})}>
              <sq-icon name="solar:restart-bold"></sq-icon> Reset / start new
            </button>
          </div>
          <sq-section-nav .items=${items} active=${this._active}></sq-section-nav>
        </aside>

        <main id="main-content" class="shell-main" tabindex="-1">
          <div class="sheet bp-frame">
          ${this._active === 'review'
            ? html`<sq-review-export
                .requirements=${m.requirements}
                .yaml=${m.yaml}
                .sectionTitles=${sectionTitles}
                .toast=${this._toast}
              ></sq-review-export>`
            : html`<sq-configurator
                .section=${activeSection}
                .sectionIndex=${m.catalogueView.sections.findIndex((s) => s.id === this._active)}
                .sectionTotal=${m.catalogueView.sections.length}
                .pct=${this._sectionPct(this._active)}
              ></sq-configurator>`}
          </div>
        </main>
        </div>
      </div>
    `;
  }

  render() {
    if (!this._booted) {
      return html`<div class="boot"><span class="vt">staq<span class="signal">paq</span></span><span class="boot-note">booting…</span></div>`;
    }
    return html`${this._renderSkipLink()}${this._renderWorkspace()}${this._renderModal()}`;
  }
}

customElements.define('sq-app', SqApp);
export { SqApp };
