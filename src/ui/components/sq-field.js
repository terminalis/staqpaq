// <sq-field> — a single bill-of-materials line: a tracked uppercase label + a
// required/critical/optional/resolved stamp, then the field's control rendered
// by kind. (ui-manifest.yaml :: component_kit.customization · screen_treatments[configurator])
//
// A dumb renderer of a field VIEW-MODEL the screen prepares from the catalogue
// projection (read_catalogue_view) + canonical state. It evaluates no gating
// and stores nothing; it dispatches intent events the screen wires to runIntent:
//   * sq-option-activate  (bubbled from <sq-option>) — set/toggle a curated option
//   * sq-field-input      — a text/color value committed
//   * sq-field-custom     — a custom escape-hatch value committed
//   * sq-field-clear      — clear the field
// The five MVP field kinds only: text, single_select, multi_select, boolean,
// color. (capabilities.yaml :: assumptions)

import { LitElement, html } from 'lit';

const BRAND_ICON_PREFIXES = ['simple-icons:', 'logos:', 'hugeicons:'];
const PROVIDER_ICON_PLACEHOLDER_FIELDS = new Set([
  'frontend.framework',
  'frontend.styling',
  'frontend.component_library',
  'frontend.native_shells',
  'database.provider',
  'backend.storage',
  'backend.jobs',
  'backend.realtime',
  'auth.provider',
  'payments.provider',
  'ai.providers',
  'notifications.transactional_email',
  'notifications.marketing_email',
  'notifications.sms',
  'notifications.push',
  'deployment.host',
  'deployment.ci',
  'monitoring.observability',
  'monitoring.analytics',
  'support.docs',
  'support.provider',
  'design.icons',
  'assets.stock',
]);
const ICON_PLACEHOLDER_EXCLUDED_KEYS = new Set([
  'none',
  'other',
  'custom',
  'self',
  'self_host',
  'self_hosted',
  'self-hosted',
]);
const ICON_PLACEHOLDER_EXCLUDED_LABELS = [
  /^none$/i,
  /^other$/i,
  /^custom$/i,
  /^self[-\s]?hosted$/i,
  /headless\s*\/\s*none/i,
  /internal\s*\/\s*in-repo/i,
];

function hasBrandIcon(option) {
  return typeof option.icon === 'string' && BRAND_ICON_PREFIXES.some((prefix) => option.icon.startsWith(prefix));
}

function isIconPlaceholderExcluded(option) {
  const key = String(option.key || '').toLowerCase();
  const label = String(option.label || '').trim();
  return ICON_PLACEHOLDER_EXCLUDED_KEYS.has(key)
    || ICON_PLACEHOLDER_EXCLUDED_LABELS.some((pattern) => pattern.test(label));
}

function fieldUsesIconPlaceholders(field, options) {
  return PROVIDER_ICON_PLACEHOLDER_FIELDS.has(field.path) && options.some(hasBrandIcon);
}

class SqField extends LitElement {
  static properties = {
    field: { type: Object },
    // transient: the colour shown live while the native picker is open, before
    // the decision commits on `change` (never persisted)
    _live: { state: true },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.field = null;
    this._live = null;
  }

  // a fresh projection (new field object) clears any live colour preview
  willUpdate(changed) {
    if (changed.has('field')) this._live = null;
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  _onInput(e) {
    this._emit('sq-field-input', { path: this.field.path, value: e.target.value });
  }

  _onCustom(e) {
    this._emit('sq-field-custom', { path: this.field.path, value: e.target.value });
  }

  // multi_select custom: gather EVERY free-text row (committed rows + the trailing
  // "add another" row) and emit the whole list; the capability drops blanks.
  _onCustomMulti() {
    const inputs = this.querySelectorAll('.custom-multi input.custom-row');
    const values = Array.from(inputs).map((el) => el.value);
    this._emit('sq-field-custom', { path: this.field.path, values });
  }

  _onCustomRemove(idx) {
    const values = (this.field.custom?.values || []).filter((_, i) => i !== idx);
    this._emit('sq-field-custom', { path: this.field.path, values });
  }

  _onClear() {
    this._emit('sq-field-clear', { path: this.field.path });
  }

  _labelId(f) {
    return `sq-field-label-${String(f.path || 'field').replace(/[^a-z0-9_-]+/gi, '-')}`;
  }

  // Native colour picker: reflect the picked colour into the hex box live (on
  // `input`, as the user moves in the picker) and commit on `change` (when the
  // picker closes). `_live` is transient view state only; the commit persists.
  _onColorLive(e) {
    this._live = e.target.value;
  }

  _onColorCommit(e) {
    this._live = e.target.value;
    this._emit('sq-field-input', { path: this.field.path, value: e.target.value });
  }

  // Bridge a child <sq-option> activation into a path-aware record intent.
  _onOption(e) {
    e.stopPropagation();
    this._emit('sq-record', { path: this.field.path, optionKey: e.detail.optionKey });
  }

  _renderControl(f) {
    const opts = f.options || [];

    if (f.kind === 'text') {
      return html`
        <input
          class="sq-text-input"
          type="text"
          .value=${f.value ?? ''}
          placeholder=${f.placeholder ?? 'enter a value'}
          aria-label=${f.label}
          @change=${this._onInput}
        />
      `;
    }

    if (f.kind === 'color' && opts.length === 0) {
      const shown = this._live ?? (f.value ?? '');
      return html`
        <div class="sq-color">
          <label class="sq-color-btn">
            <input
              class="sw"
              type="color"
              .value=${this._live || f.value || '#000000'}
              aria-label=${`${f.label} color`}
              @input=${this._onColorLive}
              @change=${this._onColorCommit}
            />
            <span>Select color</span>
          </label>
          <input
            class="sq-text-input"
            type="text"
            .value=${shown}
            placeholder="#RRGGBB"
            aria-label=${`${f.label} hex`}
            @change=${this._onInput}
          />
        </div>
      `;
    }

    // option-based kinds: single_select, multi_select, boolean,
    // and color with a curated swatch set. In a single_select where a choice is
    // already made, the OTHER (non-selected, non-gated) options are muted/faded.
    const single = f.kind === 'single_select';
    const anySelected = opts.some((o) => o.selected);
    const usesIconPlaceholders = fieldUsesIconPlaceholders(f, opts);
    const controlRole = f.kind === 'multi_select' ? 'checkbox' : 'radio';
    return html`
      <div
        class="opts"
        role=${controlRole === 'radio' ? 'radiogroup' : 'group'}
        aria-labelledby=${this._labelId(f)}
        @sq-option-activate=${this._onOption}
      >
        ${opts.map(
          (o) => {
            const iconPlaceholder = usesIconPlaceholders && !o.icon && !isIconPlaceholderExcluded(o);
            return html`
              <sq-option
                control-role=${controlRole}
                option-key=${o.key}
                label=${o.label}
                icon=${o.icon || ''}
                icon-color=${o.iconColor || ''}
                ?icon-placeholder=${iconPlaceholder}
                ?selected=${!!o.selected}
                ?gated=${!!o.gated}
                ?muted=${single && anySelected && !o.selected && !o.gated}
                reason=${o.reason || ''}
              ></sq-option>
            `;
          },
        )}
      </div>
    `;
  }

  render() {
    const f = this.field;
    if (!f) return html``;
    const custom = f.custom || {};
    return html`
      <div class="field-head">
        <span id=${this._labelId(f)} class="field-label"
          >${f.label}${f.primary
            ? html`<abbr class="req-mark" title="Required">**</abbr>`
            : f.severity === 'recommended'
              ? html`<abbr class="req-mark" title="Recommended">*</abbr>`
              : ''}</span
        >
        ${f.resolved
          ? html`<button
              class="btn ghost field-clear"
              style="padding:2px 8px;font-size:10px"
              @click=${this._onClear}
            >
              Clear
            </button>`
          : ''}
      </div>
      ${f.note ? html`<p class="field-note">${f.note}</p>` : ''}
      ${this._renderControl(f)}
      ${this._renderCustom(f, custom)}
    `;
  }

  // The free-text escape hatch: one input for a single_select, a repeatable list
  // (committed rows + a trailing "add another" row) for a multi_select, which can
  // hold MORE THAN ONE custom entry.
  _renderCustom(f, custom) {
    if (!custom.enabled) return '';
    if (!custom.multi) {
      return html`
        <div class="custom">
          <span class="pfx">custom</span>
          <input
            type="text"
            .value=${custom.value ?? ''}
            placeholder="value outside the curated set"
            aria-label=${`${f.label} custom value`}
            @change=${this._onCustom}
          />
        </div>
      `;
    }
    const values = custom.values || [];
    return html`
      <div class="custom-multi">
        ${values.map(
          (val, i) => html`
            <div class="custom">
              <span class="pfx">custom</span>
              <input
                class="custom-row"
                type="text"
                .value=${val}
                aria-label=${`${f.label} custom value ${i + 1}`}
                @change=${this._onCustomMulti}
              />
              <button
                class="custom-remove"
                title="Remove"
                aria-label=${`Remove ${f.label} custom value ${i + 1}`}
                @click=${() => this._onCustomRemove(i)}
              >
                ✕
              </button>
            </div>
          `,
        )}
        <div class="custom">
          <span class="pfx">custom</span>
          <input
            class="custom-row"
            type="text"
            .value=${''}
            placeholder=${values.length ? 'add another…' : 'value outside the curated set'}
            aria-label=${`${f.label} new custom value`}
            @change=${this._onCustomMulti}
          />
        </div>
      </div>
    `;
  }
}

customElements.define('sq-field', SqField);
export { SqField };
