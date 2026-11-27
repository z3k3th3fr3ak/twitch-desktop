import type { StoredAuth } from "../core/auth";
import type { Emote } from "../core/emotes";
import type { ChatMessage } from "../core/irc";
import { emptyWorkspace, openChannel, saveNamedLayout, type Workspace } from "../core/layout";
import type { LiveStream } from "../core/live";
import type { Favorite } from "../platform/storage";
import { DEFAULT_SETTINGS, type Settings } from "../state/settings";

export const DEMO_LOGIN = "preview";

function svgEmote(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="38" text-anchor="middle" font-family="sans-serif" font-size="13" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const channels = [
  {
    login: "harbor",
    userId: "101",
    displayName: "Harbor",
    game: "Just Chatting",
    viewers: 12400,
    title: "late night questions",
  },
  {
    login: "kiln",
    userId: "102",
    displayName: "Kiln",
    game: "Art",
    viewers: 3180,
    title: "painting the river",
  },
  {
    login: "northline",
    userId: "103",
    displayName: "Northline",
    game: "VALORANT",
    viewers: 8060,
    title: "ranked until sunrise",
  },
  {
    login: "lowtide",
    userId: "104",
    displayName: "Lowtide",
    game: "Music",
    viewers: 1640,
    title: "lofi set",
  },
] as const;

function stream(index: number): LiveStream {
  const channel = channels[index];
  if (!channel) throw new Error("missing demo channel");
  return {
    streamId: `demo-${channel.userId}`,
    userId: channel.userId,
    login: channel.login,
    displayName: channel.displayName,
    title: channel.title,
    gameName: channel.game,
    viewers: channel.viewers,
    startedAt: "2026-11-21T02:10:00Z",
    thumbnail: "",
    language: "en",
  };
}

function message(
  channel: string,
  id: string,
  login: string,
  displayName: string,
  text: string,
  color: string,
): ChatMessage {
  return {
    kind: "message",
    id,
    channel,
    userId: login,
    login,
    displayName,
    color,
    text,
    badges: [],
    emoteTag: "",
    timestamp: 1,
    isAction: false,
  };
}

export type DemoState = {
  settings: Settings;
  auth: StoredAuth;
  favorites: Favorite[];
  workspace: Workspace;
  savedLayouts: ReturnType<typeof saveNamedLayout>;
  streams: LiveStream[];
  messages: Record<string, ChatMessage[]>;
  emotes: Map<string, Emote>;
};

export function buildDemo(): DemoState {
  let workspace = emptyWorkspace("quad");
  for (const channel of channels) {
    workspace = openChannel(workspace, {
      login: channel.login,
      userId: channel.userId,
      displayName: channel.displayName,
    });
  }
  workspace = { ...workspace, focus: 0 };
  const emotes = new Map<string, Emote>([
    ["KEKW", { id: "kekw", name: "KEKW", source: "7tv", url: svgEmote("KEKW", "#ff7a2f") }],
    ["catJAM", { id: "cat", name: "catJAM", source: "bttv", url: svgEmote("catJAM", "#2f6f62") }],
  ]);
  return {
    settings: { ...DEFAULT_SETTINGS, clientId: "previewclientid00000000", theme: "ember" },
    auth: {
      accessToken: "preview",
      refreshToken: "preview",
      expiresAt: Date.now() + 60_000_000,
      scopes: ["user:read:follows", "chat:read", "chat:edit"],
      login: DEMO_LOGIN,
      userId: "1",
      displayName: "Preview",
      avatar: "",
    },
    favorites: [
      { login: "harbor", userId: "101", displayName: "Harbor", avatar: "" },
      { login: "kiln", userId: "102", displayName: "Kiln", avatar: "" },
    ],
    workspace,
    savedLayouts: saveNamedLayout([], "Evening", workspace),
    streams: channels.map((_, index) => stream(index)),
    messages: {
      harbor: [
        message("harbor", "h1", "ada", "Ada", "this grid is the whole point KEKW", "#f0c36a"),
        message(
          "harbor",
          "h2",
          "mino",
          "Mino",
          "@preview the harbor cam is the one with sound",
          "#9ecbff",
        ),
        message(
          "harbor",
          "h3",
          "harbor",
          "Harbor",
          "click another tile if you want their audio",
          "#ffb088",
        ),
      ],
      kiln: [
        message("kiln", "k1", "kiln", "Kiln", "brush is still wet catJAM", "#d7c4a3"),
        message("kiln", "k2", "ness", "Ness", "the orange on the water is perfect", "#f3a6c1"),
      ],
      northline: [
        message(
          "northline",
          "n1",
          "northline",
          "Northline",
          "one more round then I swap back",
          "#b7d7ff",
        ),
      ],
      lowtide: [message("lowtide", "l1", "lowtide", "Lowtide", "no vocals this hour", "#b7ebc9")],
    },
    emotes,
  };
}
