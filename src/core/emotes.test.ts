import { describe, expect, it } from "vitest";
import {
  fragmentMessage,
  mergeEmotes,
  parse7tvEmotes,
  parseBttvEmotes,
  parseFfzEmotes,
  parseTwitchEmoteTag,
  sliceByUtf8Bytes,
} from "./emotes";

describe("twitch emote positions", () => {
  it("parses the emote tag and ignores broken ranges", () => {
    expect(parseTwitchEmoteTag("25:0-4,6-10/1902:12-16")).toEqual([
      { id: "25", start: 0, end: 4 },
      { id: "25", start: 6, end: 10 },
      { id: "1902", start: 12, end: 16 },
    ]);
    expect(parseTwitchEmoteTag("")).toEqual([]);
    expect(parseTwitchEmoteTag("25:nope/:/4-1")).toEqual([]);
  });

  it("treats positions as inclusive UTF-8 byte offsets", () => {
    const message = "é Kappa";
    expect(sliceByUtf8Bytes(message, 3, 7)?.text).toBe("Kappa");
    const emoji = "🔥 Kappa";
    expect(sliceByUtf8Bytes(emoji, 5, 9)?.text).toBe("Kappa");
    expect(sliceByUtf8Bytes("Kappa", 0, 4)?.text).toBe("Kappa");
    expect(sliceByUtf8Bytes("é", 0, 0)).toBeNull();
  });

  it("replaces official emotes without eating the surrounding text", () => {
    const fragments = fragmentMessage("é Kappa hi", "25:3-7", new Map());
    expect(fragments.map((fragment) => fragment.text)).toEqual(["é", " ", "Kappa", " ", "hi"]);
    const emote = fragments[2];
    expect(emote?.type).toBe("emote");
    if (emote?.type === "emote") {
      expect(emote.emote.source).toBe("twitch");
      expect(emote.emote.url).toContain("/emoticons/v2/25/");
    }
  });
});

describe("third-party emotes", () => {
  it("parses 7TV global and user sets", () => {
    const global = parse7tvEmotes({
      emotes: [{ id: "a", name: "KEKW", data: { host: { url: "//cdn.7tv.app/emote/a" } } }],
    });
    const user = parse7tvEmotes({
      emote_set: { emotes: [{ id: "b", name: "catJAM", data: { id: "b" } }] },
    });
    expect(global[0]).toMatchObject({
      source: "7tv",
      name: "KEKW",
      url: "https://cdn.7tv.app/emote/a/2x.webp",
    });
    expect(user[0]?.url).toBe("https://cdn.7tv.app/emote/b/2x.webp");
  });

  it("parses BTTV lists and FFZ sets", () => {
    expect(parseBttvEmotes([{ id: "b", code: "monkaS", imageType: "png" }])[0]).toMatchObject({
      source: "bttv",
      url: "https://cdn.betterttv.net/emote/b/2x",
    });
    expect(
      parseBttvEmotes({
        channelEmotes: [],
        sharedEmotes: [{ id: "c", code: "pepeL" }],
      }),
    ).toHaveLength(1);
    const ffz = parseFfzEmotes({
      sets: {
        "1": {
          emoticons: [
            {
              id: 9,
              name: "LULW",
              urls: { "1": "//cdn.frankerfacez.com/1", "2": "https://cdn.frankerfacez.com/2" },
            },
          ],
        },
      },
    });
    expect(ffz[0]).toMatchObject({ source: "ffz", url: "https://cdn.frankerfacez.com/2" });
  });

  it("lets later packs override earlier names and skips blank tokens", () => {
    const map = mergeEmotes([
      [{ id: "1", name: "KEKW", source: "ffz", url: "ffz" }],
      [{ id: "2", name: "KEKW", source: "7tv", url: "7tv" }],
    ]);
    expect(map.get("KEKW")?.source).toBe("7tv");
    const fragments = fragmentMessage("hi KEKW  ", "", map);
    expect(fragments.map((fragment) => fragment.type)).toEqual(["text", "text", "emote", "text"]);
    expect(fragmentMessage("   ", "", map).every((fragment) => fragment.type === "text")).toBe(
      true,
    );
  });

  it("does not let a third-party name overwrite a Twitch emote range", () => {
    const map = mergeEmotes([[{ id: "x", name: "Kappa", source: "bttv", url: "bttv" }]]);
    const fragments = fragmentMessage("Kappa", "25:0-4", map);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.type).toBe("emote");
    if (fragments[0]?.type === "emote") expect(fragments[0].emote.source).toBe("twitch");
  });
});
