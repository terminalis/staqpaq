// <sq-yaml-preview> — a steel-bordered ink well that DISPLAYS a serialized
// staqpaq.yaml string with palette-tinted syntax (keys steel / values paper /
// punctuation rust / comments faint). No VS-Code-default theme.
// (ui-manifest.yaml :: component_kit.customization · screen_treatments[review_export])
//
// This is a presentation projection ONLY. It receives an already-serialized
// `value` string and adds color spans for display. It performs NO canonical
// serialization — the authoritative serializer lives in the logic layer and
// export_pack re-derives at commit. The empty draft shows a faint placeholder
// comment (ux-design.yaml :: edge_states.empty_state_strategy).

import { LitElement, html } from 'lit';

const EMPTY_PLACEHOLDER = '# select parts -> resolved decisions appear here';

/** Split a single yaml line into display tokens {cls,text}. Visual tinting
 *  only — NOT a parser. cls: k=key, v=value, s=punctuation(rust), c=comment. */
function tintLine(line) {
  const tokens = [];
  if (line.trim() === '') return [{ cls: '', text: line }];

  const lead = line.match(/^\s*/)[0];
  const rest = line.slice(lead.length);
  if (lead) tokens.push({ cls: '', text: lead });

  // full-line comment
  if (rest.startsWith('#')) {
    tokens.push({ cls: 'c', text: rest });
    return tokens;
  }

  // list item:  - value
  let body = rest;
  const listM = body.match(/^-\s+/);
  if (listM) {
    tokens.push({ cls: 's', text: '- ' });
    body = body.slice(listM[0].length);
    tokens.push(...tintScalar(body));
    return tokens;
  }

  // key: value
  const kv = body.match(/^([^:#\s][^:]*?):(\s*)(.*)$/);
  if (kv) {
    tokens.push({ cls: 'k', text: kv[1] });
    tokens.push({ cls: 's', text: ':' });
    if (kv[2]) tokens.push({ cls: '', text: kv[2] });
    if (kv[3] !== '') tokens.push(...tintScalar(kv[3]));
    return tokens;
  }

  tokens.push(...tintScalar(body));
  return tokens;
}

/** Tint a scalar / flow value: punctuation ([],{}) rust, rest paper. */
function tintScalar(text) {
  const out = [];
  let buf = '';
  for (const ch of text) {
    if ('[]{},'.includes(ch)) {
      if (buf) { out.push({ cls: 'v', text: buf }); buf = ''; }
      out.push({ cls: 's', text: ch });
    } else {
      buf += ch;
    }
  }
  if (buf) out.push({ cls: 'v', text: buf });
  return out;
}

class SqYamlPreview extends LitElement {
  static properties = {
    value: { type: String },
    filename: { type: String },
    tag: { type: String },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.value = '';
    this.filename = 'staqpaq.yaml';
    this.tag = 'canonical · derived';
  }

  render() {
    const text = (this.value && this.value.trim()) ? this.value : EMPTY_PLACEHOLDER;
    const isEmpty = !(this.value && this.value.trim());
    const lines = text.split('\n');
    return html`
      <div class="yamlbox">
        <sq-ticket>
          <div class="yh">
            <span>${this.filename}</span>
            <span>${this.tag}</span>
          </div>
          <pre class="yaml" aria-label="staqpaq.yaml preview">${
            isEmpty
              ? html`<span class="c">${EMPTY_PLACEHOLDER}</span>`
              : lines.map(
                  (line, i) => html`${i > 0 ? '\n' : ''}${tintLine(line).map(
                    (t) => html`<span class=${t.cls}>${t.text}</span>`,
                  )}`,
                )
          }</pre>
        </sq-ticket>
      </div>
    `;
  }
}

customElements.define('sq-yaml-preview', SqYamlPreview);
export { SqYamlPreview };
