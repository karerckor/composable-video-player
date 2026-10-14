import { describe, expect, it } from 'vitest';
import { h, iconEl } from '../../src/ui/dom.js';
import { createTranslator } from '../../src/ui/i18n.js';
import { defaultIcons, createIconSet } from '../../src/ui/icons.js';

describe('h', () => {
  it('creates elements with attributes and children', () => {
    const el = h('button', { class: 'a b', type: 'button', disabled: true, hidden: false, 'data-x': 1 }, 'Play', null, h('span'));
    expect(el.className).toBe('a b');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.dataset.x).toBe('1');
    expect(el.textContent).toBe('Play');
    expect(el.querySelector('span')).not.toBeNull();
  });
});

describe('iconEl', () => {
  it('parses svg into the SVG namespace', () => {
    const el = iconEl('<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>');
    expect(el.className).toBe('vp-icon');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    const svg = el.querySelector('svg')!;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.querySelector('path')).not.toBeNull();
  });

  it('strips scripts, event handlers and javascript urls', () => {
    const el = iconEl('<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><path d="M0 0"/></a><foreignObject><div/></foreignObject></svg>');
    const svg = el.querySelector('svg')!;
    expect(svg.hasAttribute('onload')).toBe(false);
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('foreignObject')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('[href]')).toBeNull();
  });

  it('removes elements outside the allowlist, including foreign namespaces', () => {
    const el = iconEl('<svg><h:iframe xmlns:h="http://www.w3.org/1999/xhtml" srcdoc="&lt;script&gt;1&lt;/script&gt;"/></svg>');
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.getElementsByTagNameNS('*', 'iframe').length).toBe(0);
  });

  it('drops obfuscated javascript urls and any href', () => {
    const el = iconEl('<svg><a href="java&#9;script:alert(1)"><path d="M0 0"/></a></svg>');
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('[href]')).toBeNull();
  });

  it('removes style elements but keeps shapes', () => {
    const el = iconEl('<svg><style>body{background:red}</style><path d="M0 0"/></svg>');
    expect(el.querySelector('style')).toBeNull();
    expect(el.querySelector('path')).not.toBeNull();
  });

  it('removes use and animation elements', () => {
    const el = iconEl('<svg><use href="#x"/><animate attributeName="href" to="javascript:alert(1)"/></svg>');
    expect(el.querySelector('use')).toBeNull();
    expect(el.querySelector('animate')).toBeNull();
  });

  it('removes style attributes with url() and unsafe attribute values', () => {
    const el = iconEl('<svg><path style="fill:URL(http://evil)" d="M0 0"/><path d="M1 1" fill=" JaVa&#10;script:x"/></svg>');
    const paths = el.querySelectorAll('path');
    expect(paths[0]!.hasAttribute('style')).toBe(false);
    expect(paths[1]!.hasAttribute('fill')).toBe(false);
    expect(paths[1]!.getAttribute('d')).toBe('M1 1');
  });

  it('keeps every default icon intact', () => {
    for (const markup of Object.values(defaultIcons)) {
      const svg = iconEl(markup).querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.querySelector('path')).not.toBeNull();
    }
  });

  it('ignores invalid markup', () => {
    expect(iconEl('<div>not svg</div>').childElementCount).toBe(0);
    expect(iconEl('<svg><unclosed></svg').childElementCount).toBe(0);
  });
});

describe('createTranslator', () => {
  it('translates with fallback to the key and overrides', () => {
    const ru = createTranslator('ru');
    expect(ru('quality')).toBe('Качество');
    expect(ru('Мой текст')).toBe('Мой текст');
    const en = createTranslator('en', { quality: 'Resolution' });
    expect(en('quality')).toBe('Resolution');
    expect(en('speed')).toBe('Speed');
  });

  it('does not return Object.prototype members', () => {
    const t = createTranslator('en');
    expect(t('constructor')).toBe('constructor');
    expect(t('toString')).toBe('toString');
  });
});

describe('icons', () => {
  it('provides every icon and allows overrides', () => {
    expect(defaultIcons.play).toContain('<svg');
    const icons = createIconSet({ play: '<svg id="custom"></svg>' });
    expect(icons('play')).toContain('custom');
    expect(icons('pause')).toBe(defaultIcons.pause);
  });
});
