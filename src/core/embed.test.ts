import { describe, expect, it } from "vitest";
import { embedParentNeedsHttps, embedParents, playerFrameSrc } from "./embed";

describe("twitch embed parents", () => {
  it("includes the release host and localhost", () => {
    expect(embedParents("tauri.localhost")).toEqual(["tauri.localhost", "localhost"]);
    expect(embedParents("localhost")).toEqual(["localhost", "tauri.localhost"]);
    expect(embedParents("")).toEqual(["localhost", "tauri.localhost"]);
  });

  it("requires https for the Windows release origin and not for dev", () => {
    expect(embedParentNeedsHttps("tauri.localhost")).toBe(true);
    expect(embedParentNeedsHttps("localhost")).toBe(false);
    expect(embedParentNeedsHttps("127.0.0.1")).toBe(false);
  });

  it("repeats parent for every allowed host", () => {
    const src = playerFrameSrc("harbor", embedParents("tauri.localhost"), {
      autoplay: true,
      muted: true,
    });
    expect(src.startsWith("https://player.twitch.tv/?")).toBe(true);
    expect(src).toContain("channel=harbor");
    expect(src).toContain("parent=tauri.localhost");
    expect(src).toContain("parent=localhost");
    expect(src).not.toContain("parent=https");
  });
});
