import { describe, expect, it } from "vitest";
import {
  chunk,
  collectPages,
  helixErrorMessage,
  parseChannelSearch,
  parseFollowedStreams,
  parseUsers,
  twitchThumbnail,
} from "./helix";

describe("helix parsers", () => {
  it("parses followed live streams and the next cursor", () => {
    const page = parseFollowedStreams({
      data: [
        {
          id: "stream-1",
          user_id: "7",
          user_login: "CaseOh",
          user_name: "CaseOh",
          game_name: "Just Chatting",
          title: "morning",
          viewer_count: 12000,
          started_at: "2026-11-21T00:00:00Z",
          thumbnail_url:
            "https://static-cdn.jtvnw.net/previews-ttv/live_user_caseoh-{width}x{height}.jpg",
          language: "en",
        },
        { user_login: "missing-id" },
      ],
      pagination: { cursor: "next" },
    });
    expect(page.cursor).toBe("next");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ login: "caseoh", viewers: 12000 });
    expect(page.items[0]?.thumbnail).toContain("440x248");
    expect(twitchThumbnail("https://img/{width}/{height}", 80, 40)).toBe("https://img/80/40");
  });

  it("parses users and channel search hits", () => {
    expect(
      parseUsers({
        data: [
          { id: "7", login: "CaseOh", display_name: "CaseOh", profile_image_url: "https://img" },
        ],
      })[0],
    ).toMatchObject({ userId: "7", login: "caseoh", avatar: "https://img" });
    expect(
      parseChannelSearch({
        data: [
          {
            id: "8",
            broadcaster_login: "pokimane",
            display_name: "pokimane",
            title: "later",
            game_name: "VALORANT",
            is_live: false,
            thumbnail_url: "https://avatar",
          },
        ],
      })[0],
    ).toMatchObject({ login: "pokimane", isLive: false, gameName: "VALORANT" });
  });

  it("follows cursors and stops when a cursor repeats", async () => {
    const pages = [
      { items: ["a"], cursor: "1" },
      { items: ["b"], cursor: "1" },
      { items: ["c"], cursor: null },
    ];
    const seen: Array<string | undefined> = [];
    const items = await collectPages(async (cursor) => {
      seen.push(cursor);
      return pages[seen.length - 1] ?? { items: [], cursor: null };
    });
    expect(items).toEqual(["a", "b"]);
    expect(seen).toEqual([undefined, "1"]);
  });

  it("explains helix errors without dumping a token", () => {
    expect(helixErrorMessage(401, JSON.stringify({ message: "Invalid OAuth token" }))).toBe(
      "Invalid OAuth token",
    );
    expect(helixErrorMessage(500, "nope")).toBe("Twitch returned HTTP 500.");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
