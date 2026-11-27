export function safeExternalHref(raw: string | undefined | null, fallback = '#'): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString();
    }
  } catch {
    // Invalid or relative URL is rejected for external anchors.
  }
  return fallback;
}
