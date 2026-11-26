import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("settings", () => {
  it("leaves the overlay hotkey off until someone turns it on", () => {
    expect(DEFAULT_SETTINGS.hotkey).toBe(false);
    expect(parseSettings({}).hotkey).toBe(false);
    expect(parseSettings({ hotkey: true }).hotkey).toBe(true);
  });

  it("follows the new stream and leaves the mini player muted", () => {
    expect(DEFAULT_SETTINGS.audioFollow).toBe("follow");
    expect(DEFAULT_SETTINGS.miniAlwaysOnTop).toBe(false);
    expect(parseSettings({}).audioFollow).toBe("follow");
    expect(parseSettings({ audioFollow: "mini" }).audioFollow).toBe("mini");
    expect(parseSettings({ audioFollow: "focused" }).audioFollow).toBe("focused");
    expect(parseSettings({ audioFollow: "nope" }).audioFollow).toBe("follow");
    expect(parseSettings({ miniAlwaysOnTop: true }).miniAlwaysOnTop).toBe(true);
  });
});
