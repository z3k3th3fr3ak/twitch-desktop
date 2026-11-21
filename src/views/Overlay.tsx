import { useEffect, useState } from "react";
import { MessageView } from "../components/Message";
import { parseStoredAuth } from "../core/auth";
import type { Emote } from "../core/emotes";
import { messageHidden, nextSendAt, normalizeWords } from "../core/filter";
import { chatEventFromIrc, parseIrcLine, reduceChannel, type VisibleChatItem } from "../core/irc";
import type { TileChannel } from "../core/layout";
import { buildDemo } from "../demo/fixtures";
import type { Launch } from "../launch";
import { chatSend, emitApp, isTauri, loadSecret, onApp } from "../platform/backend";
import { loadPersisted } from "../platform/storage";
import { loadChannelEmotes } from "../platform/twitch";
import { setClickThrough } from "../platform/windows";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "../state/settings";

export function Overlay({ launch }: { launch: Launch }) {
  const demo = launch.demo ? buildDemo() : null;
  const [channel, setChannel] = useState<TileChannel | null>(
    demo?.workspace.tiles[0] ??
      (launch.channel ? { login: launch.channel, userId: "", displayName: launch.channel } : null),
  );
  const [messages, setMessages] = useState<Record<string, VisibleChatItem[]>>(demo?.messages ?? {});
  const [emotes, setEmotes] = useState<Map<string, Emote>>(demo?.emotes ?? new Map());
  const [settings, setSettings] = useState<Settings>(demo?.settings ?? DEFAULT_SETTINGS);
  const [draft, setDraft] = useState("");
  const [selfLogin, setSelfLogin] = useState(demo?.auth.login ?? "");
  const [lastSent, setLastSent] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--pill", String(settings.overlayOpacity));
    if (launch.demo || !isTauri()) return;
    void setClickThrough(settings.clickThrough);
  }, [settings, launch.demo]);

  useEffect(() => {
    if (launch.demo || !isTauri()) return;
    let unlisten: Array<() => void> = [];
    let cancelled = false;
    void (async () => {
      const persisted = await loadPersisted();
      if (cancelled) return;
      setSettings(persisted.settings);
      const initial = persisted.workspace?.tiles[persisted.workspace.focus] ?? null;
      if (initial) setChannel(initial);
      const fns = await Promise.all([
        onApp<TileChannel | null>("workspace-focus", (next) => setChannel(next)),
        onApp<Settings>("settings-changed", (next) => setSettings(parseSettings(next))),
        onApp<string>("chat-line", (line) => {
          const parsed = parseIrcLine(line);
          if (!parsed) return;
          const event = chatEventFromIrc(parsed, Date.now());
          if (!event?.channel) return;
          setMessages((current) => ({
            ...current,
            [event.channel]: reduceChannel(current[event.channel] ?? [], event),
          }));
        }),
      ]);
      if (cancelled) {
        for (const fn of fns) fn();
        return;
      }
      unlisten = fns;
    })();
    return () => {
      cancelled = true;
      for (const fn of unlisten) fn();
    };
  }, [launch.demo]);

  useEffect(() => {
    if (launch.demo || !channel?.userId) return;
    let cancelled = false;
    void loadChannelEmotes(channel.userId)
      .then((pack) => {
        if (!cancelled) setEmotes(pack);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channel?.userId, launch.demo]);

  useEffect(() => {
    if (!isTauri() || launch.demo) return;
    void loadSecret()
      .then((secret) => {
        const stored = parseStoredAuth(secret ?? "");
        if (stored) setSelfLogin(stored.login);
      })
      .catch(() => undefined);
  }, [launch.demo]);

  const items = channel ? (messages[channel.login] ?? []) : [];
  const words = normalizeWords(settings.filterText);
  const visible = items.filter(
    (item) => item.kind !== "message" || !messageHidden(item.text, words),
  );

  return (
    <div className="overlay-root">
      <div className="overlay-toolbar" data-tauri-drag-region>
        <strong data-tauri-drag-region>{channel ? `#${channel.login}` : "Overlay"}</strong>
        <button
          type="button"
          onClick={() => void emitApp("overlay-clickthrough", !settings.clickThrough)}
        >
          {settings.clickThrough ? "Clicks pass through" : "Click-through"}
        </button>
      </div>
      <div className="overlay-log" style={{ fontSize: settings.chatFontSize }}>
        {visible.slice(-40).map((item) => (
          <MessageView
            key={item.id}
            item={item}
            emotes={emotes}
            selfLogin={selfLogin}
            highlight={settings.mentionHighlight}
          />
        ))}
      </div>
      <form
        className="overlay-compose"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text || !channel) return;
          const gate = nextSendAt(lastSent, Date.now());
          if (!gate.ok) return;
          if (!launch.demo) void chatSend(channel.login, text);
          setLastSent(Date.now());
          setDraft("");
        }}
      >
        <input
          value={draft}
          maxLength={450}
          placeholder={channel ? `Message #${channel.login}` : "Waiting for a stream"}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </div>
  );
}
