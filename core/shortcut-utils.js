(() => {
  'use strict';

  const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const MODIFIER_ALIASES = new Map([
    ['ctrl', 'Ctrl'],
    ['control', 'Ctrl'],
    ['alt', 'Alt'],
    ['option', 'Alt'],
    ['shift', 'Shift'],
    ['meta', 'Meta'],
    ['cmd', 'Meta'],
    ['command', 'Meta'],
    ['win', 'Meta'],
    ['super', 'Meta']
  ]);

  const KEY_ALIASES = new Map([
    [' ', 'Space'],
    ['space', 'Space'],
    ['spacebar', 'Space'],
    ['esc', 'Escape'],
    ['return', 'Enter'],
    ['del', 'Delete'],
    ['左箭头', 'ArrowLeft'],
    ['右箭头', 'ArrowRight'],
    ['上箭头', 'ArrowUp'],
    ['下箭头', 'ArrowDown']
  ]);

  const SITE_DEFAULTS = Object.freeze({
    reveal: ' ',
    familiar: '1',
    vague: '2',
    forget: '3',
    wellFamiliar: '4'
  });

  function normalizeKey(key) {
    const input = String(key ?? '');
    if (input === ' ') return 'Space';
    const raw = input.trim();
    if (!raw) return '';
    const alias = KEY_ALIASES.get(raw.toLowerCase());
    if (alias) return alias;
    if (/^key[a-z]$/i.test(raw)) return raw.slice(3).toUpperCase();
    if (/^digit[0-9]$/i.test(raw)) return raw.slice(5);
    if (raw.length === 1 && /[a-z]/i.test(raw)) return raw.toLowerCase();
    if (raw.length === 1) return raw;
    return raw[0].toUpperCase() + raw.slice(1);
  }

  function canonicalizeShortcut(shortcut) {
    if (shortcut == null) return '';
    const parts = String(shortcut)
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return '';

    const modifiers = new Set();
    let key = '';
    for (const part of parts) {
      const modifier = MODIFIER_ALIASES.get(part.toLowerCase());
      if (modifier) modifiers.add(modifier);
      else key = normalizeKey(part);
    }
    if (/^[a-z]$/.test(key)) key = key.toUpperCase();

    return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key]
      .filter(Boolean)
      .join('+');
  }

  function eventParts(event) {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');
    return [...modifiers, normalizeKey(event.key)].filter(Boolean);
  }

  function formatEventShortcut(event) {
    const key = normalizeKey(event.key);
    if (!key || ['Ctrl', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
    return canonicalizeShortcut(eventParts(event).join('+'));
  }

  function matchShortcut(event, shortcut) {
    return formatEventShortcut(event) === canonicalizeShortcut(shortcut);
  }

  function findDuplicateShortcuts(shortcuts) {
    const byShortcut = new Map();
    for (const [name, shortcut] of Object.entries(shortcuts ?? {})) {
      const canonical = canonicalizeShortcut(shortcut);
      if (!canonical) continue;
      const names = byShortcut.get(canonical) ?? [];
      names.push(name);
      byShortcut.set(canonical, names);
    }
    return [...byShortcut.values()].filter((names) => names.length > 1);
  }

  function siteShortcutKey(action) {
    return SITE_DEFAULTS[action] ?? '';
  }

  globalThis.MaimemoShortcutUtils = Object.freeze({
    normalizeKey,
    canonicalizeShortcut,
    formatEventShortcut,
    matchShortcut,
    findDuplicateShortcuts,
    siteShortcutKey,
    SITE_DEFAULTS
  });
})();
