import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderCodeBlock, highlightHtmlCode } from './site-highlight.mjs';

test('TypeScript code gets tokens while preserving its exact text', () => {
  const source = "const label: string = '<script>alert(1)</script>';";
  const dom = new JSDOM(renderCodeBlock(source, 'ts'));
  assert.ok(dom.window.document.querySelector('.hljs-keyword'));
  assert.ok(dom.window.document.querySelector('.hljs-string'));
  assert.equal(dom.window.document.querySelector('code').textContent, source);
  assert.equal(dom.window.document.querySelector('script'), null);
  dom.window.close();
});

test('shell comments and strings are highlighted', () => {
  const html = renderCodeBlock('# Install\nnpm install "composable-video-player"', 'bash');
  assert.match(html, /hljs-comment/);
  assert.match(html, /hljs-string/);
});

test('unsupported languages stay escaped plain text', () => {
  const dom = new JSDOM(renderCodeBlock('<img src=x onerror=alert(1)>', 'unknown-language'));
  assert.equal(dom.window.document.querySelector('img'), null);
  assert.equal(dom.window.document.querySelector('code').textContent, '<img src=x onerror=alert(1)>');
  dom.window.close();
});

test('landing-page code is highlighted without changing inline code or interpreting escaped markup', () => {
  const dom = new JSDOM(highlightHtmlCode('<p><code>inline</code></p><pre><code class="language-html">&lt;div&gt;Hello&lt;/div&gt;</code></pre>'));
  assert.equal(dom.window.document.querySelector('p code').innerHTML, 'inline');
  assert.ok(dom.window.document.querySelector('pre .hljs-tag'));
  assert.equal(dom.window.document.querySelector('pre code').textContent, '<div>Hello</div>');
  assert.equal(dom.window.document.querySelector('pre div'), null);
  dom.window.close();
});
