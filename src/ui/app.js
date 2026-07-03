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
import { pickStaqpaqYaml } from './upload.js';
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
  import_draft: {
    title: 'Import staqpaq.yaml?',
    body: 'This replaces your current draft with the decisions from the imported file. Your existing decisions are cleared.',
    confirmLabel: 'Import file',
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
    _bootNoticeDismissed: { state: true },
    _welcome: { state: true },
    _kindSweepNotice: { state: true },
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
    this._toast = null; // { kind: 'ok'|'error', text } | null
    this._toastTimer = 0;
    this._pendingFocusPath = null;
    this._booted = false;
    this._bootInfo = null; // façade boot telemetry (resumed draft, migrations)
    this._bootNoticeDismissed = false;
    this._welcome = false; // the pre-workspace welcome screen (about + stack-type chooser)
    this._kindSweepNotice = 0; // project-only answers cleared by a kind switch
  }

  updated(changed) {
    if (changed.has('_active') && changed.get('_active') !== this._active) {
      this._scrollWorkspaceTop();
    }
    if (this._pendingFocusPath) this._focusPendingField();
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
    this.addEventListener('sq-nav', (e) => this._onNav(e.detail.to, e.detail.focusPath));
    this.addEventListener('sq-reset', () => this._run('reset_draft', {}));
    this.addEventListener('sq-export', (e) => this._onExport(e.detail.scope));
    this.addEventListener('sq-copy', () => this._onCopyYaml());
    this.addEventListener('sq-toast-dismiss', () => {
      window.clearTimeout(this._toastTimer);
      this._toast = null;
    });
    this.addEventListener('sq-modal-confirm', (e) => this._onModalConfirm(e));
    this.addEventListener('sq-modal-cancel', () => {
      if (this._projectPrompt) {
        this._projectPrompt = false;
        this._projectPromptError = '';
      }
      else this._modal = null;
    });

    await facade.boot();
    this._bootInfo = facade.readBootInfo();
    this.refresh();
    if (this._active == null) this._active = this._firstSectionId();
    // True first run only: no decisions AND an empty event log (the log survives
    // resets, so returning users go straight to their workspace). The welcome
    // screen shows BEFORE the workspace mounts — the scanline reveal fires when
    // the user has chosen a stack type and the workspace appears.
    this._welcome =
      Object.keys(this._m.entity.selections).length === 0 && facade.readEvents().length === 0;
    this._booted = true;
  }

  /** Coarse relative time for the resumed-draft strip (presentation only). */
  _relTime(iso) {
    const then = Date.parse(iso || '');
    if (!Number.isFinite(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (mins < 60) return rtf.format(-Math.max(mins, 0), 'minute');
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / (60 * 24)), 'day');
  }

  refresh() {
    this._m = {
      entity: facade.readEntity(),
      catalogueView: facade.readCatalogueView(),
      requirements: facade.readRequirements(),
      yaml: facade.readPreviewYaml(),
      persist: facade.readPersistenceHealth(),
    };
  }

  /** Sections the user can actually work in (guarded ones are listed but inert). */
  _workableSections() {
    return ((this._m && this._m.catalogueView.sections) || []).filter((s) => !s.guarded);
  }

  _firstSectionId() {
    const secs = this._workableSections();
    return (secs[0] && secs[0].id) || 'review';
  }

  async _run(capabilityId, input) {
    const res = await facade.invokeIntent(capabilityId, input);
    if (!res.ok && res.error && res.error.code === 'CONFIRMATION_REQUIRED') {
      this._modal = { capabilityId, input, token: res.error.confirmationToken };
      return;
    }
    this._afterMutation(capabilityId, res, input);
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
    this._afterMutation(m.capabilityId, res, m.input);
  }

  _afterMutation(capabilityId, res, input) {
    if (!res.ok) {
      if (capabilityId === 'import_draft' && res.error) {
        const line = res.error.line ? ` (line ${res.error.line})` : '';
        this._showToast('error', `Import failed${line} — ${res.error.message || res.error.code}.`);
      }
      return;
    }
    this.refresh();
    if (capabilityId === 'reset_draft') {
      this._active = this._firstSectionId();
    }
    // Switching the staqpaq kind sweeps project-only answers — say so, visibly.
    if (capabilityId === 'record_selection' && input && input.path === 'meta.kind') {
      const swept = (res.result && res.result.swept_paths) || [];
      this._kindSweepNotice = swept.length;
    }
    if (capabilityId === 'import_draft') {
      const out = res.result || {};
      const n = out.selection_count || 0;
      const dropped = (out.dropped_paths || []).length;
      const base = `Imported ${n} decision${n === 1 ? '' : 's'}`;
      if (dropped) {
        // partial adopt: stays visible until dismissed so the drop is never missed
        this._showToast('ok', `${base} — ${dropped} entr${dropped === 1 ? 'y' : 'ies'} didn't match the current catalogue and ${dropped === 1 ? 'was' : 'were'} dropped.`);
      } else {
        this._showToast('ok', `${base}.`, 6000);
      }
      // land on the review bench (also leaves the welcome screen when the
      // import started there) — the summary + toast are visible right away
      this._welcome = false;
      this._active = 'review';
    }
    this._ensureActiveValid();
  }

  async _onImport() {
    const picked = await pickStaqpaqYaml();
    if (!picked) return; // picker cancelled
    this._run('import_draft', { text: picked.text, file_name: picked.file_name });
  }

  // Copy the façade-derived staqpaq.yaml preview string — delivery only, same
  // posture as download; never routed through export_pack.
  async _onCopyYaml() {
    const text = (this._m && this._m.yaml) || '';
    if (!text.trim()) {
      this._showToast('error', 'Nothing to copy yet — make a decision first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this._showToast('ok', 'staqpaq.yaml copied to clipboard.', 4000);
    } catch {
      this._showToast('error', 'Copy blocked by the browser — use Download instead.');
    }
  }

  _onNav(to, focusPath) {
    this._pendingFocusPath = focusPath || null;
    if (to === 'configurator') {
      if (!this._active || this._active === 'review') this._active = this._firstSectionId();
      return;
    }
    if (to === 'review') { this._active = 'review'; return; }
    if (to === 'next' || to === 'prev') { this._step(to); return; }
    // an explicit section id
    this._active = to;
    if (focusPath) this.requestUpdate(); // ensure a focus pass even when already on the section
  }

  // After a deep link (an open recommendation) the target section renders in a
  // child component; poll briefly until the field label exists, then move
  // focus and bring it into view. setTimeout (not rAF) so it also completes in
  // backgrounded tabs. View behavior only — no state involved.
  _focusPendingField(attempt = 0) {
    const path = this._pendingFocusPath;
    if (!path) return;
    const slug = String(path).replace(/[^a-z0-9_-]+/gi, '-');
    const label = this.querySelector(`#sq-field-label-${slug}`);
    if (!label) {
      if (attempt < 15) window.setTimeout(() => this._focusPendingField(attempt + 1), 32);
      else this._pendingFocusPath = null;
      return;
    }
    this._pendingFocusPath = null;
    label.focus({ preventScroll: true });
    label.scrollIntoView({ block: 'start' });
    const field = label.closest('sq-field');
    if (field) {
      field.classList.add('field-flash');
      window.setTimeout(() => field.classList.remove('field-flash'), 1300);
    }
  }

  _step(dir) {
    const secs = this._workableSections();
    const idx = secs.findIndex((s) => s.id === this._active);
    if (dir === 'next') {
      this._active = idx >= 0 && idx < secs.length - 1 ? secs[idx + 1].id : 'review';
    } else if (idx > 0) {
      this._active = secs[idx - 1].id;
    }
  }

  _ensureActiveValid() {
    if (this._active === 'review') return;
    if (!this._workableSections().find((s) => s.id === this._active)) {
      this._active = this._firstSectionId();
    }
  }

  _showToast(kind, text, ms) {
    window.clearTimeout(this._toastTimer);
    this._toast = { kind, text };
    if (ms) this._toastTimer = window.setTimeout(() => { this._toast = null; }, ms);
  }

  async _onExport(scope) {
    let res;
    try {
      res = await facade.invokeIntent('export_pack', { scope }); // passes ONLY scope
    } catch {
      res = null; // unexpected throw — treated exactly like a failed result below
    }
    if (!res || !res.ok) {
      this._showToast('error', 'Export failed — nothing was downloaded.'); // stays until dismissed
      return;
    }
    try {
      downloadPack(res.result);
    } catch {
      this._showToast('error', 'Download failed — nothing was saved.');
      return;
    }
    this._showToast('ok', scope === 'pack' ? 'Pack exported' : 'staqpaq.yaml exported', 6000);
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

  // The welcome screen — shown BEFORE the workspace (and its scanline reveal):
  // the about text, the stack-type chooser that sets the pipeline direction,
  // and the import entry point. Reopenable any time from the staqpaq mark at
  // the top of the rail.
  _renderWelcome() {
    const sel = (this._m && this._m.entity.selections) || {};
    const kind = sel['meta.kind'];
    const hasDraft = Object.keys(sel).some((k) => k !== 'meta.kind');
    const current = (on) => (on ? html`<span class="wc-now">current draft</span>` : '');
    return html`
      <main id="main-content" class="welcome" tabindex="-1">
        <div class="welcome-panel bp-frame">
          <div class="welcome-brand">
            <span class="welcome-mark vt">staq<span class="signal">paq</span></span>
            <span class="welcome-sub">build manifest</span>
          </div>
          <p class="welcome-body">
            staqpaq records your build decisions — stack, providers, surfaces —
            derives what they imply (env vars, brand assets, provider notes), and
            exports a deterministic pack: <code>staqpaq.yaml</code> plus companion
            docs. Hand the pack to a teammate or a coding agent as the build's
            bill of materials. Undecided fields simply stay open.
          </p>
          <p class="welcome-body">
            Everything runs locally in your browser and works offline; your draft
            autosaves on this device.
          </p>
          <div class="eyebrow welcome-choose">Choose your stack type</div>
          <div class="welcome-choices">
            <button class="welcome-choice" type="button" @click=${() => this._chooseKind('project')}>
              <span class="wc-title vt">Project stack</span>
              <span class="wc-desc">One product, end to end — identity, stack, surfaces, assets.</span>
              ${current(kind !== 'profile' && hasDraft)}
            </button>
            <button class="welcome-choice" type="button" @click=${() => this._chooseKind('profile')}>
              <span class="wc-title vt">Vendor stack</span>
              <span class="wc-desc">Your favoured tools and providers, reusable across projects.</span>
              ${current(kind === 'profile')}
            </button>
          </div>
          <div class="welcome-actions">
            <button class="btn ghost" @click=${() => this._onImport()}>
              <sq-icon name="solar:upload-minimalistic-bold"></sq-icon> Import staqpaq.yaml
            </button>
            ${hasDraft || kind
              ? html`<button class="btn ghost" @click=${() => { this._welcome = false; }}>
                  Continue where you left off
                </button>`
              : ''}
          </div>
          <a class="welcome-src" href="https://github.com/terminalis/staqpaq" target="_blank" rel="noopener">
            view source on GitHub
          </a>
        </div>
      </main>
    `;
  }

  // Choosing a stack type sets the pipeline direction. Project is the default
  // (kind unset); switching a profile draft back simply clears the kind
  // (non-destructive — vendor answers all apply to a project). Switching TO a
  // vendor stack sweeps project-only answers; the rail notice reports it.
  async _chooseKind(kind) {
    const cur = this._m && this._m.entity.selections['meta.kind'];
    if (kind === 'profile' && cur !== 'profile') {
      await this._run('record_selection', { path: 'meta.kind', option_key: 'profile' });
    } else if (kind === 'project' && cur === 'profile') {
      await this._run('clear_selection', { path: 'meta.kind' });
    }
    this._welcome = false;
  }

  // Rail notices: the one-time resumed-draft strip (+ catalogue-migration report)
  // and the persistent save-degradation banner. Pure projections of boot / persist
  // telemetry read from the façade.
  _renderRailNotices() {
    const parts = [];
    const b = this._bootInfo;
    if (b && b.resumed && !this._bootNoticeDismissed) {
      const n = b.decided_count;
      const when = b.updated_at ? `, updated ${this._relTime(b.updated_at)}` : '';
      const migrated = b.migrated_paths.length
        ? ` ${b.migrated_paths.length} saved selection${b.migrated_paths.length === 1 ? ' no longer matched the current catalogue and was' : 's no longer matched the current catalogue and were'} removed.`
        : '';
      parts.push(html`<div class="rail-notice" role="status">
        <span>Resumed draft — ${n} decision${n === 1 ? '' : 's'}${when}.${migrated} Reset to start fresh.</span>
        <button class="notice-x" type="button" aria-label="Dismiss resumed-draft notice"
          @click=${() => { this._bootNoticeDismissed = true; }}>✕</button>
      </div>`);
    }
    if (this._kindSweepNotice > 0) {
      const n = this._kindSweepNotice;
      parts.push(html`<div class="rail-notice" role="status">
        <span>Kind switched — ${n} project-specific answer${n === 1 ? ' was' : 's were'} cleared
        (they don't apply to a vendor profile).</span>
        <button class="notice-x" type="button" aria-label="Dismiss kind-switch notice"
          @click=${() => { this._kindSweepNotice = 0; }}>✕</button>
      </div>`);
    }
    const p = this._m && this._m.persist;
    if (p && p.ok === false) {
      parts.push(html`<div class="rail-notice crit" role="status">
        Changes aren't being saved (${p.quota ? 'storage full' : 'storage blocked'}).
        Your work stays in this tab — export now to keep it.
      </div>`);
    }
    return parts.length ? html`<div class="rail-notices">${parts}</div>` : '';
  }

  _renderWorkspace() {
    const m = this._m;
    const sectionTitles = {};
    const sectionOf = {}; // field path -> owning section id (for deep links)
    for (const s of m.catalogueView.sections) {
      sectionTitles[s.id] = s.title;
      for (const f of s.fields || []) sectionOf[f.path] = s.id;
    }
    const items = m.catalogueView.sections.map((s) => ({
      id: s.id, number: s.number, title: s.title,
      resolved: s.resolvedCount, total: s.fieldCount,
      done: s.fieldCount > 0 && s.resolvedCount === s.fieldCount,
      guarded: !!s.guarded, reason: s.guardReason || '',
    }));
    items.push({ id: 'review', number: '→', title: 'Review & Export', done: false });
    const activeSection = m.catalogueView.sections.find((s) => s.id === this._active);
    const projectName = m.entity.selections['project.name'] || m.entity.selections['project.name.custom'];
    const isProfile = m.entity.selections['meta.kind'] === 'profile';
    const overallPct = Math.round(m.requirements.readiness.overall_pct || 0);
    const sheetLabel = this._active === 'review'
      ? 'review'
      : `${activeSection ? activeSection.number : '—'} / ${m.catalogueView.sections.length}`;

    return html`
      <div class="workspace" data-enter>
        <h1 class="sr-only">staqpaq — application build-manifest generator</h1>
        <div class="scanline" aria-hidden="true"></div>
        <div class="workspace-reveal">
        <aside class="shell-rail">
          <div class="bp-titleblock">
            <button
              class="tb-brand"
              type="button"
              title="About staqpaq — welcome screen"
              aria-label="staqpaq — open the welcome screen"
              @click=${() => { this._welcome = true; }}
            >
              <span class="tb-mark vt">staq<span class="signal">paq</span></span>
              <span class="tb-meta">${isProfile ? 'vendor stack' : 'build manifest'}</span>
            </button>
            <div class="tb-grid">
              ${isProfile
                ? html`<div class="tb-cell"><span class="tb-k">kind</span><span class="tb-v">vendor stack</span></div>`
                : html`<button
                    class="tb-cell tb-project"
                    type="button"
                    title="Add or change project name"
                    aria-label="Add or change project name"
                    @click=${this._openProjectPrompt}
                  >
                    <span class="tb-k">project</span><span class="tb-v">${projectName || 'untitled'}</span>
                  </button>`}
              <div class="tb-cell"><span class="tb-k">sheet</span><span class="tb-v">${sheetLabel}</span></div>
              <div class="tb-cell"><span class="tb-k">readiness</span><span class="tb-v">${overallPct}%</span></div>
            </div>
          </div>
          <div class="rail-actions">
            <button class="btn ghost rail-reset" @click=${() => this._run('reset_draft', {})}>
              <sq-icon name="solar:restart-bold"></sq-icon> Reset / start new
            </button>
          </div>
          ${this._renderRailNotices()}
          <sq-section-nav .items=${items} active=${this._active}></sq-section-nav>
        </aside>

        <main id="main-content" class="shell-main" tabindex="-1">
          <div class="sheet bp-frame">
          ${this._active === 'review'
            ? html`<sq-review-export
                .requirements=${m.requirements}
                .yaml=${m.yaml}
                .sectionTitles=${sectionTitles}
                .sectionOf=${sectionOf}
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
    if (this._welcome) {
      return html`${this._renderSkipLink()}${this._renderWelcome()}${this._renderModal()}`;
    }
    return html`${this._renderSkipLink()}${this._renderWorkspace()}${this._renderModal()}`;
  }
}

customElements.define('sq-app', SqApp);
export { SqApp };
