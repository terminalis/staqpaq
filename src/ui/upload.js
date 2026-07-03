// UI delivery helper — the mirror of download.js for the import direction.
// Opens the browser file picker and reads the chosen file's text. Delivery
// only: it computes nothing and decides nothing; the text goes to the
// import_draft capability, which parses, validates, and normalizes it.

/**
 * Prompt for a .yaml file and read it.
 * @returns {Promise<{ text: string, file_name: string } | null>} null when the
 * user cancels the picker.
 */
export function pickStaqpaqYaml() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,text/yaml';
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (value) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return done(null);
      try {
        const text = await file.text();
        done({ text, file_name: file.name || '' });
      } catch {
        done({ text: '', file_name: file.name || '' }); // unreadable → capability reports it
      }
    });
    // cancel fires on the input in current evergreen browsers
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}
