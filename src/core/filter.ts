export function normalizeWords(input: string): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of input.split(/[\n,]/)) {
    const word = part.trim().toLowerCase();
    if (word.length < 2 || word.length > 40 || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= 100) break;
  }
  return words;
}

export function messageHidden(text: string, words: readonly string[]): boolean {
  if (words.length === 0 || !text) return false;
  const haystack = text.toLowerCase();
  return words.some((word) => word.length > 0 && haystack.includes(word));
}

export function mentionsLogin(text: string, login: string): boolean {
  const name = login.trim().toLowerCase();
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_])@?${escaped}(?![a-z0-9_])`, "i").test(text);
}

export function nextSendAt(
  lastSentAt: number,
  now: number,
  gapMs = 1500,
): { ok: boolean; waitMs: number } {
  const readyAt = lastSentAt + gapMs;
  if (now >= readyAt) return { ok: true, waitMs: 0 };
  return { ok: false, waitMs: readyAt - now };
}
