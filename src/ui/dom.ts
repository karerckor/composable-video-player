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

function sanitizeSvg(root: Element): void {
  for (const bad of [...root.querySelectorAll('script, foreignObject')]) bad.remove();
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
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
