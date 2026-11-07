import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import './highlight.css';

// Bundle only the grammar used by this example, rather than every supported language.
hljs.registerLanguage('typescript', typescript);

export function renderCode(target: HTMLElement, source: string): void {
  target.classList.add('hljs', 'language-typescript');
  // highlight() escapes source text before adding its own span markup.
  target.innerHTML = hljs.highlight(source, { language: 'typescript', ignoreIllegals: true }).value;
}
