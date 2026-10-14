import { describe, expect, it } from 'vitest';
import { h, iconEl } from '../../src/ui/dom';
import { createTranslator } from '../../src/ui/i18n';
import { defaultIcons, createIconSet } from '../../src/ui/icons';

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
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
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
});

describe('icons', () => {
  it('provides every icon and allows overrides', () => {
    expect(defaultIcons.play).toContain('<svg');
    const icons = createIconSet({ play: '<svg id="custom"></svg>' });
    expect(icons('play')).toContain('custom');
    expect(icons('pause')).toBe(defaultIcons.pause);
  });
});
