import { describe, expect, it } from "vitest";
import { pointerInOverlayHandle } from "./overlay-hit";

describe("overlay close handle", () => {
  const origin = { x: 100, y: 200 };
  const size = { width: 400, height: 600 };

  it("hits the top-right handle and misses the chat underneath", () => {
    expect(pointerInOverlayHandle({ x: 470, y: 210 }, origin, size, 1)).toBe(true);
    expect(pointerInOverlayHandle({ x: 120, y: 500 }, origin, size, 1)).toBe(false);
    expect(pointerInOverlayHandle({ x: 499, y: 247 }, origin, size, 1)).toBe(true);
    expect(pointerInOverlayHandle({ x: 499, y: 248 }, origin, size, 1)).toBe(false);
  });

  it("scales the handle for a high-dpi screen", () => {
    expect(pointerInOverlayHandle({ x: 450, y: 220 }, origin, size, 2)).toBe(true);
    expect(pointerInOverlayHandle({ x: 300, y: 220 }, origin, size, 2)).toBe(false);
  });
});
