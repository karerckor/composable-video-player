export function extOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1]!.toLowerCase() : '';
}

export function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, new URL(base, typeof location !== 'undefined' ? location.href : undefined)).href;
  } catch {
    return url;
  }
}
