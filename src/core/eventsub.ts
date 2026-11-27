export const MAX_EVENTSUB_CHANNELS = 40;

export type EventSubFrame =
  | { kind: "welcome"; sessionId: string; keepaliveSeconds: number }
  | { kind: "keepalive" }
  | { kind: "reconnect"; url: string }
  | {
      kind: "notification";
      subscriptionType: string;
      subscriptionId: string;
      event: Record<string, unknown>;
    }
  | { kind: "revocation"; subscriptionType: string; status: string }
  | { kind: "ignore"; messageType: string };

export type OnlineNotice = {
  userId: string;
  login: string;
  displayName: string;
  startedAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseEventSub(raw: string): EventSubFrame {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { kind: "ignore", messageType: "invalid-json" };
  }
  const root = record(body);
  const metadata = root ? record(root.metadata) : null;
  const payload = root ? record(root.payload) : null;
  const messageType = metadata ? text(metadata.message_type) || "unknown" : "unknown";
  const session = payload ? record(payload.session) : null;

  if (messageType === "session_welcome") {
    const sessionId = session ? text(session.id) : "";
    const keepalive =
      session && typeof session.keepalive_timeout_seconds === "number"
        ? session.keepalive_timeout_seconds
        : 10;
    if (!sessionId) return { kind: "ignore", messageType };
    return { kind: "welcome", sessionId, keepaliveSeconds: keepalive };
  }
  if (messageType === "session_keepalive") return { kind: "keepalive" };
  if (messageType === "session_reconnect") {
    const url = session ? text(session.reconnect_url) : "";
    if (!url) return { kind: "ignore", messageType };
    return { kind: "reconnect", url };
  }
  if (messageType === "notification") {
    const subscription = payload ? record(payload.subscription) : null;
    const event = payload ? record(payload.event) : null;
    return {
      kind: "notification",
      subscriptionType: subscription ? text(subscription.type) : "",
      subscriptionId: subscription ? text(subscription.id) : "",
      event: event ?? {},
    };
  }
  if (messageType === "revocation") {
    const subscription = payload ? record(payload.subscription) : null;
    return {
      kind: "revocation",
      subscriptionType: subscription ? text(subscription.type) : "",
      status: subscription ? text(subscription.status) : "",
    };
  }
  return { kind: "ignore", messageType };
}

export function streamOnlineFromEvent(event: Record<string, unknown>): OnlineNotice | null {
  const userId = text(event.broadcaster_user_id);
  const login = text(event.broadcaster_user_login).toLowerCase();
  const displayName = text(event.broadcaster_user_name) || login;
  const startedAt = text(event.started_at);
  if (!userId || !login || !startedAt) return null;
  return { userId, login, displayName, startedAt };
}

export function eventsubSubscription(
  type: "stream.online" | "stream.offline",
  broadcasterId: string,
  sessionId: string,
) {
  return {
    type,
    version: "1",
    condition: { broadcaster_user_id: broadcasterId },
    transport: { method: "websocket" as const, session_id: sessionId },
  };
}

export function subscriptionId(body: unknown): string | null {
  const root = record(body);
  const data = root && Array.isArray(root.data) ? root.data[0] : null;
  const row = record(data);
  const id = row ? text(row.id) : "";
  return id || null;
}

export function channelsForEventSub<T extends { userId: string }>(favorites: readonly T[]): T[] {
  return favorites.slice(0, MAX_EVENTSUB_CHANNELS);
}
