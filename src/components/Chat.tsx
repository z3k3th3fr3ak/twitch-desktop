import { useState } from "react";
import type { Emote } from "../core/emotes";
import { messageHidden, normalizeWords } from "../core/filter";
import type { VisibleChatItem } from "../core/irc";
import { MessageView } from "./Message";

export function Chat({
  channel,
  items,
  emotes,
  selfLogin,
  status,
  filterText,
  highlight,
  fontSize,
  onSend,
}: {
  channel: string | null;
  items: VisibleChatItem[];
  emotes: ReadonlyMap<string, Emote>;
  selfLogin: string;
  status: string;
  filterText: string;
  highlight: boolean;
  fontSize: number;
  onSend: (text: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const words = normalizeWords(filterText);
  const visible = items.filter(
    (item) => item.kind !== "message" || !messageHidden(item.text, words),
  );
  const hidden = items.length - visible.length;
  return (
    <aside className="chat" style={{ fontSize }}>
      <header>
        <div>
          <h2>{channel ? `#${channel}` : "Chat"}</h2>
          <p>{channel ? "Follows the tile with sound" : "Focus a stream to read its chat"}</p>
        </div>
        <span className="chat-status">{status}</span>
      </header>
      <div className="log">
        {visible.map((item) => (
          <MessageView
            key={item.kind === "message" ? item.id : item.id}
            item={item}
            emotes={emotes}
            selfLogin={selfLogin}
            highlight={highlight}
          />
        ))}
        {hidden > 0 ? <p className="msg system">{hidden} hidden by your filter</p> : null}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!text || !channel) return;
          void onSend(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          maxLength={450}
          disabled={!channel}
          placeholder={channel ? `Message #${channel}` : "No stream focused"}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!channel || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
