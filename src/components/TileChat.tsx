import { useState } from "react";
import type { Emote } from "../core/emotes";
import { messageHidden, normalizeWords } from "../core/filter";
import type { VisibleChatItem } from "../core/irc";
import { ChatLog } from "./Chat";

export function TileChat({
  channel,
  displayName,
  items,
  emotes,
  selfLogin,
  filterText,
  highlight,
  fontSize,
  onSend,
  onHide,
}: {
  channel: string;
  displayName: string;
  items: readonly VisibleChatItem[];
  emotes: ReadonlyMap<string, Emote>;
  selfLogin: string;
  filterText: string;
  highlight: boolean;
  fontSize: number;
  onSend: (text: string) => void;
  onHide: () => void;
}) {
  const [draft, setDraft] = useState("");
  const words = normalizeWords(filterText);
  const visible = items.filter(
    (item) => item.kind !== "message" || !messageHidden(item.text, words),
  );
  return (
    <section className="tile-chat" style={{ fontSize }}>
      <header className="tile-chat-bar">
        <span>#{channel}</span>
        <button type="button" aria-label={`Hide chat for ${displayName}`} onClick={onHide}>
          ×
        </button>
      </header>
      <ChatLog
        items={visible}
        hidden={items.length - visible.length}
        emotes={emotes}
        selfLogin={selfLogin}
        highlight={highlight}
      />
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onSend(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          maxLength={450}
          aria-label={`Message #${channel}`}
          placeholder={`Message #${channel}`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
