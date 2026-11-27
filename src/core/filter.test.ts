import { describe, expect, it } from "vitest";
import { mentionsLogin, messageHidden, nextSendAt, normalizeWords } from "./filter";

describe("chat filter", () => {
  it("normalizes a word list", () => {
    expect(normalizeWords(" Spam, spam\n\nno\n, ok ")).toEqual(["spam", "no", "ok"]);
    expect(normalizeWords("a")).toEqual([]);
  });

  it("hides messages that contain a filtered word", () => {
    expect(messageHidden("buy followers now", ["followers"])).toBe(true);
    expect(messageHidden("hello", ["followers"])).toBe(false);
    expect(messageHidden("hello", [])).toBe(false);
  });

  it("highlights mentions without matching a longer login", () => {
    expect(mentionsLogin("hey @Zeke are you there", "zeke")).toBe(true);
    expect(mentionsLogin("zeke hello", "zeke")).toBe(true);
    expect(mentionsLogin("notzeke hello", "zeke")).toBe(false);
    expect(mentionsLogin("hey zeke_", "zeke")).toBe(false);
    expect(mentionsLogin("@someone", "")).toBe(false);
  });

  it("waits between outgoing messages", () => {
    expect(nextSendAt(1_000, 2_000)).toEqual({ ok: false, waitMs: 500 });
    expect(nextSendAt(1_000, 3_000)).toEqual({ ok: true, waitMs: 0 });
  });
});
