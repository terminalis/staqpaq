// Parse EXACTLY the yaml subset serializeYaml emits — nothing more. This is a
// deliberate scoping decision: staqpaq imports its own artifact, not general
// YAML. Accepted per line: `key:` (map header), `key: scalar`, and
// `key: [a, b]` flow lists, at 2-space indents; blank lines and full-line
// `#` comments are ignored (tolerated for hand-edited files). Everything else —
// tabs, block lists, flow maps, anchors/aliases, block scalars, duplicate keys,
// odd indentation — is rejected with a line number, and unsafe key segments
// (`__proto__` / `prototype` / `constructor`) are refused outright, mirroring
// serializeYaml's UNSAFE_PATH_SEGMENTS guard. Pure: no state, no side effects.
//
// Result convention: every function returns { value|tree } on success or
// { error: { code: 'INVALID_YAML', line, message } } on failure.

const MAX_BYTES = 256 * 1024; // a staqpaq.yaml is ~1-4KB; anything huge is not ours
const UNSAFE_KEY_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const KEY_RE = /^[A-Za-z0-9][\w-]*$/;

function fail(line, message) {
  return { error: { code: 'INVALID_YAML', line, message } };
}

function safeObject() {
  return Object.create(null);
}

/** Parse one scalar token: `"quoted"` (with \\ and \" escapes) stays a string;
 *  bare true/false become booleans; any other bare run is a string. */
function parseScalar(raw, line) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    if (s.length < 2 || !s.endsWith('"')) return fail(line, 'unterminated quoted scalar');
    const body = s.slice(1, -1);
    let out = '';
    let escaped = false;
    for (const ch of body) {
      if (escaped) {
        if (ch !== '\\' && ch !== '"') return fail(line, `unsupported escape \\${ch}`);
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        return fail(line, 'unescaped quote inside scalar');
      } else {
        out += ch;
      }
    }
    if (escaped) return fail(line, 'dangling escape in scalar');
    return { value: out };
  }
  if (s === '') return fail(line, 'empty scalar');
  if (s.includes('"')) return fail(line, 'quote inside bare scalar');
  if (s === 'true') return { value: true };
  if (s === 'false') return { value: false };
  return { value: s };
}

/** Parse a `[a, "b, c", d]` flow list of scalars. */
function parseFlowList(raw, line) {
  const inner = raw.trim().slice(1, -1);
  if (inner.trim() === '') return { value: [] };
  const items = [];
  let buf = '';
  let inQuotes = false;
  let escaped = false;
  const commit = () => {
    if (buf.trim() === '') return fail(line, 'empty list member');
    const parsed = parseScalar(buf, line);
    if (parsed.error) return parsed;
    items.push(parsed.value);
    buf = '';
    return { value: true };
  };
  for (const ch of inner) {
    if (inQuotes) {
      buf += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') { inQuotes = true; buf += ch; continue; }
    if (ch === ',') {
      const res = commit();
      if (res.error) return res;
      continue;
    }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}') {
      return fail(line, 'nested flow collections are not staqpaq output');
    }
    buf += ch;
  }
  if (inQuotes) return fail(line, 'unterminated quoted scalar in list');
  const res = commit();
  if (res.error) return res;
  return { value: items };
}

/**
 * Parse a staqpaq.yaml string into a nested plain tree (null-prototype nodes;
 * leaves are strings, booleans, or arrays of strings/booleans).
 * Returns { tree } or { error: { code: 'INVALID_YAML', line, message } }.
 */
export function parseStaqpaqYaml(text) {
  if (typeof text !== 'string') return fail(0, 'input is not text');
  if (text.length > MAX_BYTES) return fail(0, `input exceeds ${MAX_BYTES} bytes`);

  const root = safeObject();
  const stack = [root]; // stack[d] receives keys indented d levels deep
  let pendingHeader = null; // { key, line, childDepth } — a map awaiting its first entry

  const lines = text.split(/\r\n|\n/);
  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1;
    const raw = lines[n];
    if (raw.includes('\t')) return fail(lineNo, 'tabs are not staqpaq output');
    const body = raw.trim();
    if (body === '' || body.startsWith('#')) continue;

    const indentLen = raw.length - raw.trimStart().length;
    if (indentLen % 2 !== 0) return fail(lineNo, 'indentation must be 2-space steps');
    const depth = indentLen / 2;

    if (pendingHeader) {
      if (depth !== pendingHeader.childDepth) {
        return fail(pendingHeader.line, `map "${pendingHeader.key}" has no entries`);
      }
      pendingHeader = null;
    }
    if (depth > stack.length - 1) return fail(lineNo, 'over-indented line');
    stack.length = depth + 1; // a dedent closes every deeper map

    if (body.startsWith('- ') || body === '-') return fail(lineNo, 'block lists are not staqpaq output');
    const colon = body.indexOf(':');
    if (colon <= 0) return fail(lineNo, 'expected `key:` or `key: value`');
    const key = body.slice(0, colon);
    if (!KEY_RE.test(key) || UNSAFE_KEY_SEGMENTS.has(key)) return fail(lineNo, `invalid key "${key}"`);
    const node = stack[depth];
    if (key in node) return fail(lineNo, `duplicate key "${key}"`);

    const rest = body.slice(colon + 1).trim();
    if (rest === '') {
      const child = safeObject();
      node[key] = child;
      stack.push(child);
      pendingHeader = { key, line: lineNo, childDepth: depth + 1 };
      continue;
    }
    if (rest.startsWith('[')) {
      if (!rest.endsWith(']')) return fail(lineNo, 'unterminated flow list');
      const list = parseFlowList(rest, lineNo);
      if (list.error) return list;
      node[key] = list.value;
      continue;
    }
    const scalar = parseScalar(rest, lineNo);
    if (scalar.error) return scalar;
    node[key] = scalar.value;
  }

  if (pendingHeader) {
    return fail(pendingHeader.line, `map "${pendingHeader.key}" has no entries`);
  }
  return { tree: root };
}
