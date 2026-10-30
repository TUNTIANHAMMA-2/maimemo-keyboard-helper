# AGENTS.md

## Scope

This is a Manifest V3 extension for MaiMemo in Firefox / Zen and Chrome / Edge.
Read README.md, docs/PROJECT.md and docs/HERMES_HANDOFF.md before continuing maintenance.

## Rules

- Keep website interaction, settings and keyboard logic in vanilla JavaScript. The user explicitly requested liquid-glass-react: React is restricted to the decorative background adapter in ui/liquid-glass-entry.js, bundled locally with esbuild. Do not move native website controls or content into React.
- Keep one shared source tree. manifest.json is the Firefox-compatible source manifest; scripts/build-extension.mjs generates dist/firefox and dist/chromium. Do not edit generated manifests or dist files by hand.
- Preserve the Firefox extension ID and maimemoKeyboardSettings key when updating. Use browser APIs when available and chrome APIs as the fallback.
- Keep permissions and host matches limited to the MaiMemo pages required by the feature.
- Do not store or transmit account credentials, page tokens, or vocabulary contents.
- Locate the site's existing visible controls and trigger their normal DOM click behavior; do not call undocumented APIs or modify review data directly.
- Do not intercept keys while the user is typing in an input, textarea, select, or contenteditable element.
- Run `npm test`, `npm run check`, and `npm run zip` before handing off a build.
- For browser compatibility changes, also run the browser-API and chrome-API fixture suites and the native Chromium extension test when the local Playwright environment is available. State separately what was tested on fixtures, in a loaded extension, and on the real MaiMemo site.
- Read the existing working tree before committing. Do not discard uncommitted or untracked project files. Keep node_modules, dist, releases and temporary browser profiles out of Git.
- Recheck third-party notices and the official logo's redistribution terms before public release; do not describe the logo as covered by the component libraries' MIT licenses.
