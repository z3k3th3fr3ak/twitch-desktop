/** Top-right control, in CSS pixels, that stays clickable while the rest of the overlay passes clicks through. */
export const OVERLAY_HANDLE = { width: 64, height: 48 };

export function pointerInOverlayHandle(
  cursor: { x: number; y: number },
  origin: { x: number; y: number },
  size: { width: number; height: number },
  scale: number,
): boolean {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = OVERLAY_HANDLE.width * factor;
  const height = OVERLAY_HANDLE.height * factor;
  const left = origin.x + size.width - width;
  const top = origin.y;
  return cursor.x >= left && cursor.x < left + width && cursor.y >= top && cursor.y < top + height;
}
