/** How many messages a chat paints before the reader asks for older ones. */
export const CHAT_PAGE = 48;

/** The tail of a channel's buffer. New messages stay on the last page while the reader is caught up. */
export function tailWindow(
  count: number,
  pages: number,
  pageSize = CHAT_PAGE,
): { start: number; end: number } {
  const size = Math.min(Math.max(0, count), Math.max(1, pages) * pageSize);
  return { start: Math.max(0, count - size), end: Math.max(0, count) };
}
