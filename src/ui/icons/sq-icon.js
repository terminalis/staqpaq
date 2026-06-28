import { ICONS } from './icon-data.js';

const warnedMissing = new Set();
const colorAttribute = /\s(fill|stroke)="(?!none\b)[^"]*"/gi;

function toMonochrome(body) {
  return body.replace(colorAttribute, ' $1="currentColor"');
}

class SqIcon extends HTMLElement {
  static observedAttributes = ['name'];

  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    this.setAttribute('focusable', 'false');
    this._render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    const name = this.getAttribute('name') || '';
    const icon = ICONS[name];

    if (!icon) {
      this.replaceChildren();
      if (name && !warnedMissing.has(name)) {
        warnedMissing.add(name);
        console.warn(`Missing sq-icon: ${name}`);
      }
      return;
    }

    const left = icon.left || 0;
    const top = icon.top || 0;
    const width = icon.width || 24;
    const height = icon.height || 24;
    this.innerHTML = `<svg viewBox="${left} ${top} ${width} ${height}" fill="currentColor" aria-hidden="true" focusable="false" part="svg">${toMonochrome(icon.body)}</svg>`;
  }
}

customElements.define('sq-icon', SqIcon);
export { SqIcon };
