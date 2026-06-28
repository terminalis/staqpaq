# staqpaq

staqpaq is a client-only build-manifest generator. It records structured app-build
selections in browser-local state, derives implied requirements, and exports
deterministic artifacts including `staqpaq.yaml`.

There is no build step, server runtime, package release process, or runtime
environment configuration.

## Requirements

- A current evergreen browser with native ES modules and import maps.
- Node.js 20 or newer for repository checks.
- A static file server for local browser testing.

The app does not import from `node_modules` at runtime. Runtime libraries are
vendored under `vendor/`.

## Run Locally

```bash
npm run serve
```

Or use any static server from the repository root:

```bash
python -m http.server 8000
```

Then open the served URL in a browser. Opening `index.html` directly with
`file:` is not the primary path because service workers require an HTTP origin.

## Verify

Run the default gate:

```bash
npm run check
```

`check` runs:

- core architecture boundary assertions
- catalogue validation
- capability and gating tests
- derivation tests
- export serialization tests
- orchestrator guard tests

Optional static audits are kept separate from the default gate:

```bash
npm run audit
```

`audit` checks local presentation assets, the PWA cache layer, and static
accessibility semantics.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Static shell, import map, stylesheet links, app boot module |
| `sw.js` | Delivery-only service worker cache |
| `src/core/**` | Catalogue loading, state, orchestration, capabilities, derivation, export |
| `src/ui/**` | Lit-based UI components, screens, icons, fonts, styles, downloads |
| `data/**` | Versioned catalogue, derivation rules, and sample fixture |
| `vendor/**` | Vendored runtime libraries used by the import map |
| `assets/**` | App icons, manifest, logo, and social image |
| `scripts/**` | Public repository verification scripts |

## Scripts

Default developer and CI gate:

```bash
npm run check
```

Focused scripts:

```bash
npm run assert:core
npm run validate:catalogue
npm run test:capabilities
npm run test:derive
npm run test:export
npm run test:orchestrator
```

Optional audits:

```bash
npm run audit
```

The `assert:core` scripts are static architecture checks. The `test:*` scripts
are kept because they verify product behavior and output correctness that static
import-boundary checks cannot prove.

## Environment

staqpaq itself requires no runtime environment variables.

`.env.example` is committed as an empty template. `.env.local` is the ignored
local copy and should not be committed.

The exported pack may contain its own generated `.env.example` for the app being
described by the user's selections. That generated file is an output artifact,
not configuration for running staqpaq.

## Deployment

Publish the repository contents as static files. No build command or server
process is required.

## License

staqpaq project code is licensed under the MIT License. See `LICENSE`.

Vendored runtime libraries, fonts, and icon data have their own licenses. See
`THIRD_PARTY_NOTICES.md`.
