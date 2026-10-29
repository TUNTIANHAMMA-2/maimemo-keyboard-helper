# AGENTS.md

## Scope

This is a small Firefox / Zen Browser Manifest V3 extension for keyboard control of the MaiMemo web study page.

## Rules

- Keep the implementation vanilla JavaScript; no bundler or framework.
- Keep permissions and host matches limited to the MaiMemo pages required by the feature.
- Do not store or transmit account credentials, page tokens, or vocabulary contents.
- Locate the site's existing visible controls and trigger their normal DOM click behavior; do not call undocumented APIs or modify review data directly.
- Do not intercept keys while the user is typing in an input, textarea, select, or contenteditable element.
- Run `npm test`, `npm run check`, and `npm run zip` before handing off a build.
