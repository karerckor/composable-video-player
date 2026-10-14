export type Attrs = Record<string, string | number | boolean | null | undefined>;
export type Child = Node | string | null | undefined | false;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'symbol', 'title', 'desc',
]);

function sanitizeAttributes(el: Element): void {
  for (const attr of [...el.attributes]) {
    const name = attr.localName.toLowerCase();
    const unsafe =
      name.startsWith('on') ||
      name === 'href' ||
      (name === 'style' && /url\(/i.test(attr.value)) ||
      /^javascript:/i.test(attr.value.replace(/[\u0000- ]/g, ''));
    if (unsafe) el.removeAttributeNode(attr);
  }
}

/** Allowlist sanitizer: keeps only known SVG-namespace elements and strips dangerous attributes. */
function sanitizeSvg(el: Element): void {
  for (const child of [...el.children]) {
    if (child.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(child.localName)) child.remove();
    else sanitizeSvg(child);
  }
  sanitizeAttributes(el);
}

/** Parses an SVG string (never as HTML) and returns it wrapped in a `.vp-icon` span. */
export function parseSvg(markup: string): SVGElement | null {
  const source = /xmlns\s*=/.test(markup) ? markup : markup.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  sanitizeSvg(root);
  return document.importNode(root, true) as unknown as SVGElement;
}

export function iconEl(markup: string): HTMLSpanElement {
  const span = h('span', { class: 'vp-icon', 'aria-hidden': 'true' });
  const svg = parseSvg(markup);
  if (svg) span.append(svg);
  return span;
}
