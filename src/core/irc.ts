export type IrcLine = {
  tags: Record<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
  trailing: string | null;
};

export type ChatMessage = {
  kind: "message";
  id: string;
  channel: string;
  userId: string;
  login: string;
  displayName: string;
  color: string;
  text: string;
  badges: string[];
  emoteTag: string;
  timestamp: number;
  isAction: boolean;
  parentDisplayName?: string;
  parentBody?: string;
};

export type SystemLine = {
  kind: "system";
  id: string;
  channel: string;
  text: string;
};

export type ClearMessage = {
  kind: "clear-message";
  channel: string;
  messageId: string;
};

export type ClearChat = {
  kind: "clear-chat";
  channel: string;
  userId: string | null;
  text: string;
};

export type ChatEvent = ChatMessage | SystemLine | ClearMessage | ClearChat;

const TAG_ESCAPES: Record<string, string> = {
  ":": ";",
  s: " ",
  "\\": "\\",
  r: "\r",
  n: "\n",
};

export function unescapeTag(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (current === "\\" && next !== undefined) {
      out += TAG_ESCAPES[next] ?? next;
      index += 1;
    } else if (current !== undefined) {
      out += current;
    }
  }
  return out;
}

export function parseIrcLine(raw: string): IrcLine | null {
  let line = raw.replace(/\r$/, "");
  if (!line.trim()) return null;
  const tags: Record<string, string> = {};
  if (line.startsWith("@")) {
    const space = line.indexOf(" ");
    if (space === -1) return null;
    for (const piece of line.slice(1, space).split(";")) {
      if (!piece) continue;
      const eq = piece.indexOf("=");
      if (eq === -1) tags[piece] = "";
      else tags[piece.slice(0, eq)] = unescapeTag(piece.slice(eq + 1));
    }
    line = line.slice(space + 1);
  }
  let prefix: string | null = null;
  if (line.startsWith(":")) {
    const space = line.indexOf(" ");
    if (space === -1) return null;
    prefix = line.slice(1, space);
    line = line.slice(space + 1);
  }
  let trailing: string | null = null;
  const marker = line.indexOf(" :");
  if (marker !== -1) {
    trailing = line.slice(marker + 2);
    line = line.slice(0, marker);
  }
  const bits = line.split(" ").filter(Boolean);
  const command = bits[0];
  if (!command) return null;
  return { tags, prefix, command: command.toUpperCase(), params: bits.slice(1), trailing };
}

export function nickFromPrefix(prefix: string | null): string {
  if (!prefix) return "";
  return (prefix.split("!")[0] ?? "").toLowerCase();
}

function channelOf(params: string[]): string {
  return (params[0] ?? "").replace(/^#/, "").toLowerCase();
}

function badgesOf(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((badge) => badge.split("/")[0] ?? "")
    .filter(
      (badge) =>
        badge === "broadcaster" ||
        badge === "moderator" ||
        badge === "vip" ||
        badge === "subscriber",
    );
}

export function chatEventFromIrc(line: IrcLine, now: number): ChatEvent | null {
  const channel = channelOf(line.params);
  if (line.command === "PRIVMSG") {
    let text = line.trailing ?? "";
    let isAction = false;
    if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) {
      isAction = true;
      text = text.slice("\u0001ACTION ".length, -1);
    }
    const login = nickFromPrefix(line.prefix) || (line.tags.login ?? "").toLowerCase();
    const displayName = line.tags["display-name"] || login;
    const id = line.tags.id || `${now}:${login}:${text.slice(0, 16)}`;
    const parentDisplayName = line.tags["reply-parent-display-name"];
    const parentBody = line.tags["reply-parent-msg-body"];
    return {
      kind: "message",
      id,
      channel,
      userId: line.tags["user-id"] ?? "",
      login,
      displayName,
      color: line.tags.color ?? "",
      text,
      badges: badgesOf(line.tags.badges),
      emoteTag: line.tags.emotes ?? "",
      timestamp: now,
      isAction,
      ...(parentDisplayName ? { parentDisplayName } : {}),
      ...(parentBody ? { parentBody } : {}),
    };
  }
  if (line.command === "CLEARMSG") {
    const messageId = line.tags["target-msg-id"] ?? "";
    if (!messageId) return null;
    return { kind: "clear-message", channel, messageId };
  }
  if (line.command === "CLEARCHAT") {
    const userId = line.tags["target-user-id"] || null;
    const login = line.trailing ?? "";
    const duration = line.tags["ban-duration"];
    const text = userId
      ? duration
        ? `${login || "Someone"} was timed out for ${duration}s.`
        : `${login || "Someone"} was banned.`
      : "Chat was cleared.";
    return { kind: "clear-chat", channel, userId, text };
  }
  if (line.command === "NOTICE" || line.command === "USERNOTICE") {
    const text = line.tags["system-msg"] || line.trailing || "";
    if (!text) return null;
    return {
      kind: "system",
      id: line.tags.id || `${line.command}:${now}:${text.slice(0, 16)}`,
      channel,
      text,
    };
  }
  return null;
}

export type VisibleChatItem = ChatMessage | SystemLine;

const CHAT_LIMIT = 400;

export function reduceChannel(
  items: readonly VisibleChatItem[],
  event: ChatEvent,
): VisibleChatItem[] {
  if (event.kind === "message" || event.kind === "system") {
    const next = [...items, event];
    return next.length > CHAT_LIMIT ? next.slice(next.length - CHAT_LIMIT) : next;
  }
  if (event.kind === "clear-message") {
    return items.filter((item) => item.kind !== "message" || item.id !== event.messageId);
  }
  if (!event.userId) {
    return [
      {
        kind: "system",
        id: `clear-all:${event.channel}`,
        channel: event.channel,
        text: event.text,
      },
    ];
  }
  const removed = items.filter((item) => item.kind !== "message" || item.userId !== event.userId);
  return [
    ...removed,
    {
      kind: "system",
      id: `clear:${event.userId}:${event.text}`,
      channel: event.channel,
      text: event.text,
    },
  ];
}

export function nameColor(login: string, tagColor: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(tagColor)) return tagColor;
  let hash = 0;
  for (const char of login) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 58% 66%)`;
}
