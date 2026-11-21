import { describe, expect, it } from "vitest";
import {
  channelsForEventSub,
  eventsubSubscription,
  MAX_EVENTSUB_CHANNELS,
  parseEventSub,
  streamOnlineFromEvent,
  subscriptionId,
} from "./eventsub";

describe("parseEventSub", () => {
  it("reads a welcome frame", () => {
    const frame = parseEventSub(
      JSON.stringify({
        metadata: { message_type: "session_welcome" },
        payload: { session: { id: "sess-1", keepalive_timeout_seconds: 10 } },
      }),
    );
    expect(frame).toEqual({ kind: "welcome", sessionId: "sess-1", keepaliveSeconds: 10 });
  });

  it("reads keepalive, reconnect, and revocation frames", () => {
    expect(
      parseEventSub(JSON.stringify({ metadata: { message_type: "session_keepalive" } })).kind,
    ).toBe("keepalive");
    expect(
      parseEventSub(
        JSON.stringify({
          metadata: { message_type: "session_reconnect" },
          payload: { session: { reconnect_url: "wss://eventsub.wss.twitch.tv/ws?r=1" } },
        }),
      ),
    ).toEqual({ kind: "reconnect", url: "wss://eventsub.wss.twitch.tv/ws?r=1" });
    expect(
      parseEventSub(
        JSON.stringify({
          metadata: { message_type: "revocation" },
          payload: { subscription: { type: "stream.online", status: "authorization_revoked" } },
        }),
      ),
    ).toEqual({
      kind: "revocation",
      subscriptionType: "stream.online",
      status: "authorization_revoked",
    });
  });

  it("reads a stream.online notification", () => {
    const frame = parseEventSub(
      JSON.stringify({
        metadata: { message_type: "notification" },
        payload: {
          subscription: { id: "sub-1", type: "stream.online", version: "1" },
          event: {
            broadcaster_user_id: "42",
            broadcaster_user_login: "Zeke",
            broadcaster_user_name: "Zeke",
            started_at: "2026-11-21T00:00:00Z",
          },
        },
      }),
    );
    expect(frame.kind).toBe("notification");
    if (frame.kind !== "notification") return;
    expect(frame.subscriptionId).toBe("sub-1");
    expect(streamOnlineFromEvent(frame.event)).toEqual({
      userId: "42",
      login: "zeke",
      displayName: "Zeke",
      startedAt: "2026-11-21T00:00:00Z",
    });
  });

  it("ignores malformed payloads", () => {
    expect(parseEventSub("not-json")).toEqual({ kind: "ignore", messageType: "invalid-json" });
    expect(
      parseEventSub(JSON.stringify({ metadata: { message_type: "session_welcome" } })).kind,
    ).toBe("ignore");
    expect(streamOnlineFromEvent({ broadcaster_user_login: "x" })).toBeNull();
  });
});

describe("subscriptions", () => {
  it("builds a websocket subscription and reads the created id", () => {
    expect(eventsubSubscription("stream.online", "42", "sess")).toEqual({
      type: "stream.online",
      version: "1",
      condition: { broadcaster_user_id: "42" },
      transport: { method: "websocket", session_id: "sess" },
    });
    expect(subscriptionId({ data: [{ id: "sub-9", type: "stream.online" }] })).toBe("sub-9");
    expect(subscriptionId({})).toBeNull();
  });

  it("caps how many favorites get a live subscription", () => {
    const favorites = Array.from({ length: MAX_EVENTSUB_CHANNELS + 5 }, (_, index) => ({
      userId: String(index),
    }));
    expect(channelsForEventSub(favorites)).toHaveLength(MAX_EVENTSUB_CHANNELS);
  });
});
