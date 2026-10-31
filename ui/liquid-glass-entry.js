import { createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import LiquidGlass from 'liquid-glass-react';

// React owns only decorative layers. Native site text, controls and handlers stay in place.
const surfaces = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let queued = false;
let stopped = false;
let surfaceSerial = 0;

function internal(record) {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  return Boolean(target?.closest('.mm-liquid-mount'));
}

function schedule() {
  if (queued || stopped) return;
  queued = true;
  requestAnimationFrame(refresh);
}

const resizeObserver = new ResizeObserver(schedule);
const observer = new MutationObserver((records) => {
  if (records.some((record) => !internal(record))) schedule();
});

function GlassBackdrop({ node, layer, ...props }) {
  useLayoutEffect(() => {
    const filter = layer.querySelector('.mm-liquid-surface filter');
    const supported = !/firefox/i.test(navigator.userAgent) && CSS.supports('backdrop-filter', 'url(#glass) blur(1px)');
    if (filter && supported) {
      // Sample the page behind the host. A nested, translucent warp cannot see
      // that backdrop through its parent's compositing boundary in Chromium.
      const url = new URL(location.href);
      url.hash = filter.id;
      node.style.setProperty('--lg-refraction', `url(${JSON.stringify(url.href)})`);
      node.setAttribute('data-mm-refraction', 'true');
    }
    return () => {
      node.style.removeProperty('--lg-refraction');
      node.removeAttribute('data-mm-refraction');
    };
  }, [node, layer]);
  return createElement(LiquidGlass, props);
}

function shown(node) {
  if (node.closest('[hidden], [aria-hidden="true"], .hidden, [data-mm-history-source]')) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
}

function candidates() {
  const root = document.documentElement;
  const result = new Map();
  if (!root) return result;
  const add = (selector, kind) => {
    for (const node of document.querySelectorAll(selector)) if (shown(node)) result.set(node, kind);
  };
  if (root.dataset.mmUi) {
    add('main > section', 'panel');
    add('main button', 'button');
  } else {
    if (root.dataset.mmHomeLayout === 'true') {
      add('.home .taroify-tabbar', 'rail');
    }
    if (root.dataset.mmStudy === 'true' && root.dataset.mmRedesign === 'true') {
      add('.rev-root .rev-scroller', 'reading');
      add('.rev-top .interp-ctn', 'definition');
      add('#mm-memory-history', 'history');
    }
    add('#mm-study-toolbar button', 'button');
  }
  return result;
}

function pinLayer(entry) {
  // The background follows the viewport of a pane, not its scrolling text.
  entry.layer.style.transform = `translate(${entry.node.scrollLeft}px, ${entry.node.scrollTop}px)`;
}

function remove(entry) {
  resizeObserver.unobserve(entry.node);
  entry.node.removeEventListener('scroll', entry.scroll);
  entry.root.unmount();
  entry.layer.remove();
  entry.node.removeAttribute('data-mm-liquid-surface');
  surfaces.delete(entry.node);
}

function mount(node, kind) {
  const layer = document.createElement('div');
  layer.className = 'mm-liquid-mount';
  layer.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-mm-liquid-surface', kind);
  node.prepend(layer);
  const entry = { node, layer, root: createRoot(layer, { identifierPrefix: `mm-glass-${++surfaceSerial}-` }), mouseContainer: { current: node }, signature: '' };
  entry.scroll = () => pinLayer(entry);
  node.addEventListener('scroll', entry.scroll, { passive: true });
  resizeObserver.observe(node);
  surfaces.set(node, entry);
  return entry;
}

function update(entry) {
  const { node, layer } = entry;
  if (layer.parentElement !== node) node.prepend(layer);
  const width = node.clientWidth;
  const height = node.clientHeight;
  const radius = Math.max(0, parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0);
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  pinLayer(entry);
  const signature = `${width}/${height}/${radius}/${reducedMotion.matches}/${location.href.split('#')[0]}`;
  if (signature === entry.signature) return;
  entry.signature = signature;
  entry.root.render(createElement(GlassBackdrop, {
    key: signature,
    node, layer,
    className: 'mm-liquid-surface',
    style: { position: 'absolute', top: '50%', left: '50%', width: '100%', height: '100%' },
    padding: '0',
    cornerRadius: radius,
    mode: 'standard',
    displacementScale: 70,
    aberrationIntensity: 1.5,
    blurAmount: 0.0625,
    saturation: 125,
    elasticity: 0,
    overLight: false,
    mouseContainer: entry.mouseContainer,
    ...(reducedMotion.matches ? { globalMousePos: { x: 0, y: 0 }, mouseOffset: { x: 0, y: 0 } } : {})
  }));
}

function refresh() {
  queued = false;
  if (stopped) return;
  const wanted = candidates();
  for (const entry of surfaces.values()) if (!wanted.has(entry.node)) remove(entry);
  for (const [node, kind] of wanted) update(surfaces.get(node) || mount(node, kind));
}

function destroy() {
  stopped = true;
  observer.disconnect();
  resizeObserver.disconnect();
  for (const entry of surfaces.values()) remove(entry);
}

observer.observe(document, {
  subtree: true, childList: true, characterData: true, attributes: true,
  attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-mm-study', 'data-mm-home-layout', 'data-mm-redesign', 'data-mm-theme', 'data-theme']
});
window.addEventListener('resize', schedule);
window.addEventListener('pageshow', schedule);
window.addEventListener('pagehide', (event) => { if (!event.persisted) destroy(); });
reducedMotion.addEventListener('change', schedule);
globalThis.MaimemoLiquidGlass = Object.freeze({ refresh: schedule, destroy });
schedule();
