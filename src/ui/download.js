// UI delivery helper — save a capability's RETURNED export artifacts to disk.
// This is delivery, not authority: it takes the bytes export_pack already
// produced (re-derived from canonical state) and triggers a browser download.
// It computes nothing and trusts nothing from the rendered preview.

function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A filesafe slug of the project name, or '' when unset. */
function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Save the result of an export_pack invocation, named after the project. */
export function downloadPack(result) {
  if (!result) return;
  const slug = slugify(result.project_name);
  const base = slug ? `${slug}_staqpaq` : 'staqpaq';
  if (result.scope === 'pack' && result.pack_zip) {
    downloadBlob(`${base}.zip`, result.pack_zip, 'application/zip');
  } else {
    downloadBlob(`${base}.yaml`, result.staqpaq_yaml || '', 'text/yaml;charset=utf-8');
  }
}
