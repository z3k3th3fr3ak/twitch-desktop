import { describe, expect, it } from "vitest";
import { chatEventFromIrc, nameColor, parseIrcLine, reduceChannel, unescapeTag } from "./irc";

const LINE =
  "@badge-info=;badges=moderator/1,subscriber/12;color=#FF4500;display-name=Zeke;emotes=25:6-10;id=msg-1;reply-parent-display-name=Ada;reply-parent-msg-body=hello\\sworld;user-id=9 :zeke!zeke@zeke.tmi.twitch.tv PRIVMSG #Glint :hello Kappa";

describe("irc parsing", () => {
  it("unescapes IRCv3 tag values", () => {
    expect(unescapeTag("hello\\sworld\\:next")).toBe("hello world;next");
  });

  it("parses tags, prefix, and the trailing message", () => {
    const line = parseIrcLine(LINE);
    expect(line?.command).toBe("PRIVMSG");
    expect(line?.prefix).toContain("zeke!");
    expect(line?.params).toEqual(["#Glint"]);
    expect(line?.trailing).toBe("hello Kappa");
    expect(line?.tags["reply-parent-msg-body"]).toBe("hello world");
    expect(line?.tags.emotes).toBe("25:6-10");
  });

  it("turns a PRIVMSG into a chat message, including actions", () => {
    const parsed = parseIrcLine(LINE);
    if (!parsed) throw new Error("expected a line");
    const event = chatEventFromIrc(parsed, 10);
    expect(event).toMatchObject({
      kind: "message",
      id: "msg-1",
      channel: "glint",
      login: "zeke",
      displayName: "Zeke",
      badges: ["moderator", "subscriber"],
      emoteTag: "25:6-10",
      parentDisplayName: "Ada",
      parentBody: "hello world",
    });

    const action = parseIrcLine(
      "@id=a;display-name=Zeke :zeke!zeke@zeke.tmi.twitch.tv PRIVMSG #glint :\u0001ACTION waves\u0001",
    );
    if (!action) throw new Error("expected an action");
    expect(chatEventFromIrc(action, 11)).toMatchObject({ isAction: true, text: "waves" });
  });

  it("parses clears, bans, and notices", () => {
    const clear = parseIrcLine("@target-msg-id=msg-1 :tmi.twitch.tv CLEARMSG #glint :hello");
    const ban = parseIrcLine(
      "@target-user-id=9;ban-duration=60 :tmi.twitch.tv CLEARCHAT #glint :zeke",
    );
    const notice = parseIrcLine(
      "@id=n1;system-msg=Zeke\\ssubscribed :tmi.twitch.tv USERNOTICE #glint",
    );
    if (!clear || !ban || !notice) throw new Error("expected lines");
    expect(chatEventFromIrc(clear, 1)).toEqual({
      kind: "clear-message",
      channel: "glint",
      messageId: "msg-1",
    });
    expect(chatEventFromIrc(ban, 1)).toMatchObject({
      kind: "clear-chat",
      userId: "9",
      text: "zeke was timed out for 60s.",
    });
    expect(chatEventFromIrc(notice, 1)).toMatchObject({ kind: "system", text: "Zeke subscribed" });
  });

  it("ignores blank lines and pings", () => {
    expect(parseIrcLine("")).toBeNull();
    expect(parseIrcLine("PING :tmi.twitch.tv")?.command).toBe("PING");
    const ping = parseIrcLine("PING :tmi.twitch.tv");
    if (!ping) throw new Error("expected ping");
    expect(chatEventFromIrc(ping, 1)).toBeNull();
  });
});

describe("chat reduction", () => {
  it("drops a deleted message and a timed-out user", () => {
    const first = reduceChannel([], {
      kind: "message",
      id: "msg-1",
      channel: "glint",
      userId: "9",
      login: "zeke",
      displayName: "Zeke",
      color: "",
      text: "hello",
      badges: [],
      emoteTag: "",
      timestamp: 1,
      isAction: false,
    });
    const kept = reduceChannel(first, {
      kind: "message",
      id: "msg-2",
      channel: "glint",
      userId: "3",
      login: "ada",
      displayName: "Ada",
      color: "",
      text: "yo",
      badges: [],
      emoteTag: "",
      timestamp: 2,
      isAction: false,
    });
    expect(
      reduceChannel(kept, { kind: "clear-message", channel: "glint", messageId: "msg-1" }),
    ).toHaveLength(1);
    const timedOut = reduceChannel(kept, {
      kind: "clear-chat",
      channel: "glint",
      userId: "9",
      text: "zeke was timed out for 60s.",
    });
    expect(timedOut.map((item) => (item.kind === "message" ? item.login : item.text))).toEqual([
      "ada",
      "zeke was timed out for 60s.",
    ]);
  });

  it("clears every message but leaves the explanation", () => {
    const items = reduceChannel(
      [
        {
          kind: "message",
          id: "1",
          channel: "glint",
          userId: "9",
          login: "zeke",
          displayName: "Zeke",
          color: "",
          text: "hello",
          badges: [],
          emoteTag: "",
          timestamp: 1,
          isAction: false,
        },
      ],
      { kind: "clear-chat", channel: "glint", userId: null, text: "Chat was cleared." },
    );
    expect(items).toEqual([
      { kind: "system", id: "clear-all:glint", channel: "glint", text: "Chat was cleared." },
    ]);
  });

  it("uses a tag color when it is hex and otherwise a stable hue", () => {
    expect(nameColor("zeke", "#112233")).toBe("#112233");
    expect(nameColor("zeke", "")).toBe(nameColor("zeke", "nope"));
    expect(nameColor("zeke", "")).toMatch(/^hsl\(/);
  });
});
