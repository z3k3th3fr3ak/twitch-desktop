import { describe, expect, it } from "vitest";
import {
  diffLive,
  EMPTY_SEEN,
  formatUptime,
  formatViewers,
  type LiveStream,
  noteLive,
  qualityLabel,
} from "./live";

function stream(userId: string, startedAt: string, login = userId): LiveStream {
  return {
    streamId: `${userId}-${startedAt}`,
    userId,
    login,
    displayName: login,
    title: "hello",
    gameName: "Just Chatting",
    viewers: 1200,
    startedAt,
    thumbnail: "",
    language: "en",
  };
}

describe("go-live diff", () => {
  it("seeds the first observation without toasting everyone who is already live", () => {
    const result = diffLive(EMPTY_SEEN, [stream("1", "a"), stream("2", "b")], "all", new Set());
    expect(result.notify).toEqual([]);
    expect(result.next.initialized).toBe(true);
    expect(result.next.sessions).toEqual({ "1": "a", "2": "b" });
  });

  it("toasts a new session and ignores a stream that was already seen", () => {
    const seeded = diffLive(EMPTY_SEEN, [stream("1", "a")], "favorites", new Set(["1"]));
    const again = diffLive(
      seeded.next,
      [stream("1", "a"), stream("2", "b")],
      "favorites",
      new Set(["1"]),
    );
    expect(again.notify.map((item) => item.userId)).toEqual([]);
    const all = diffLive(seeded.next, [stream("1", "a"), stream("2", "b")], "all", new Set());
    expect(all.notify.map((item) => item.userId)).toEqual(["2"]);
  });

  it("toasts when a channel starts a new broadcast and stays quiet when notifications are off", () => {
    const seeded = diffLive(EMPTY_SEEN, [stream("1", "a")], "all", new Set(["1"]));
    const restarted = diffLive(seeded.next, [stream("1", "c")], "favorites", new Set(["1"]));
    expect(restarted.notify).toHaveLength(1);
    const quiet = diffLive(
      seeded.next,
      [stream("1", "c"), stream("9", "z")],
      "off",
      new Set(["1"]),
    );
    expect(quiet.notify).toEqual([]);
    expect(quiet.next.sessions).toEqual({ "1": "c", "9": "z" });
  });

  it("drops duplicate user ids and forgets channels that went offline", () => {
    const seeded = diffLive(EMPTY_SEEN, [stream("1", "a"), stream("2", "b")], "all", new Set());
    const next = diffLive(seeded.next, [stream("1", "a"), stream("1", "a")], "all", new Set());
    expect(next.notify).toEqual([]);
    expect(next.next.sessions).toEqual({ "1": "a" });
  });

  it("notes a single EventSub online event without wiping the rest of the seen map", () => {
    const seeded = diffLive(EMPTY_SEEN, [stream("1", "a")], "favorites", new Set(["1", "2"]));
    const duplicate = noteLive(seeded.next, stream("1", "a"), "favorites", new Set(["1"]));
    expect(duplicate.notify).toBe(false);
    const fresh = noteLive(seeded.next, stream("2", "b"), "favorites", new Set(["1", "2"]));
    expect(fresh.notify).toBe(true);
    expect(fresh.next.sessions["1"]).toBe("a");
    const ignored = noteLive(seeded.next, stream("3", "c"), "favorites", new Set(["1"]));
    expect(ignored.notify).toBe(false);
    expect(ignored.next.sessions["3"]).toBe("c");
  });
});

describe("display helpers", () => {
  it("formats viewer counts and uptime", () => {
    expect(formatViewers(12)).toBe("12");
    expect(formatViewers(1200)).toBe("1.2k");
    expect(formatViewers(10_400)).toBe("10k");
    expect(formatViewers(2_500_000)).toBe("2.5m");
    expect(formatUptime("2026-11-21T00:00:00Z", Date.parse("2026-11-21T01:05:00Z"))).toBe("1h 5m");
    expect(formatUptime("not-a-date", 0)).toBe("");
  });

  it("labels embed qualities without inventing extra modes", () => {
    expect(qualityLabel("chunked")).toBe("Source");
    expect(qualityLabel("auto")).toBe("Auto");
    expect(qualityLabel("720p60")).toBe("720p60");
  });
});
