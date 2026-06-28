// Registers the bespoke light-DOM <sq-*> component primitives. Importing this
// barrel defines every custom element. Screens (Step 10+) import it once.
//
// Pure-CSS custom elements (<sq-ticket>, <sq-stamp>, <sq-beamrule>) need no JS
// registration — they are styled by the global token CSS and render their
// children directly. Only the data/interaction-driven primitives are Lit
// components, imported here for their side-effect registration.

import './sq-option.js';
import './sq-field.js';
import './sq-readiness.js';
import './sq-yaml-preview.js';
import './sq-spatial-field.js';
