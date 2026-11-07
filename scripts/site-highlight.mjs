import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import { JSDOM } from 'jsdom';

for (const [name, grammar] of Object.entries({ typescript, javascript, json, bash, xml, css })) hljs.registerLanguage(name, grammar);
const aliases = { ts: 'typescript', js: 'javascript', html: 'xml', sh: 'bash', shell: 'bash' };
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function highlight(source, hint = '') {
  const name = hint.trim().split(/\s+/)[0].toLowerCase();
  const language = aliases[name] ?? name;
  return hljs.getLanguage(language)
    ? { language, html: hljs.highlight(source, { language, ignoreIllegals: true }).value }
    : { language: 'plaintext', html: escapeHtml(source) };
}

export function renderCodeBlock(source, language) {
  const result = highlight(source, language);
  return `<pre><code class="hljs language-${result.language}">${result.html}</code></pre>\n`;
}

/** Highlight code in the hand-written landing template, preserving decoded source text. */
export function highlightHtmlCode(html) {
  const dom = new JSDOM(html);
  for (const code of dom.window.document.querySelectorAll('pre > code')) {
    const language = [...code.classList].find(name => name.startsWith('language-'))?.slice(9);
    const result = highlight(code.textContent, language);
    code.classList.add('hljs', `language-${result.language}`);
    code.innerHTML = result.html;
  }
  const result = dom.window.document.body.innerHTML;
  dom.window.close();
  return result;
}
