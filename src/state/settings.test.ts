import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("settings", () => {
  it("leaves the overlay hotkey off until someone turns it on", () => {
    expect(DEFAULT_SETTINGS.hotkey).toBe(false);
    expect(parseSettings({}).hotkey).toBe(false);
    expect(parseSettings({ hotkey: true }).hotkey).toBe(true);
  });
});
