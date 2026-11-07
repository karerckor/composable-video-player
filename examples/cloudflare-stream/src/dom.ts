export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
export function button(text: string, className: string, click: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', click);
  return node;
}
export function safeStorage(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch { return null; }
}
export async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Unable to load this content.');
  return data;
}
export function watchUrl(slug: string, time?: number): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('video', slug);
  if (time !== undefined) url.searchParams.set('t', String(Math.floor(time)));
  return `${url.pathname}${url.search}`;
}
