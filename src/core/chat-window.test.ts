import { describe, expect, it } from "vitest";
import { CHAT_PAGE, tailWindow } from "./chat-window";

describe("chat window", () => {
  it("paints only the latest page while the reader is caught up", () => {
    expect(tailWindow(400, 1)).toEqual({ start: 400 - CHAT_PAGE, end: 400 });
    expect(tailWindow(10, 1)).toEqual({ start: 0, end: 10 });
  });

  it("loads older messages a page at a time", () => {
    expect(tailWindow(400, 2).start).toBe(400 - CHAT_PAGE * 2);
    expect(tailWindow(400, 20)).toEqual({ start: 0, end: 400 });
  });
});
