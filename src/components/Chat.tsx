import { useEffect, useRef, useState } from "react";
import { tailWindow } from "../core/chat-window";
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
      <ChatLog
        items={visible}
        hidden={hidden}
        emotes={emotes}
        selfLogin={selfLogin}
        highlight={highlight}
      />
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

export function ChatLog({
  items,
  hidden,
  emotes,
  selfLogin,
  highlight,
}: {
  items: readonly VisibleChatItem[];
  hidden: number;
  emotes: ReadonlyMap<string, Emote>;
  selfLogin: string;
  highlight: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);
  const [pages, setPages] = useState(1);
  const range = tailWindow(items.length, stuck ? 1 : pages);
  const visible = items.slice(range.start, range.end);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stuck || items.length === 0) return;
    node.scrollTop = node.scrollHeight;
  }, [items, stuck]);

  return (
    <div
      className="log"
      ref={scroller}
      onScroll={(event) => {
        const node = event.currentTarget;
        const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
        setStuck(atBottom);
        if (atBottom) setPages(1);
      }}
    >
      {range.start > 0 ? (
        <button type="button" className="older" onClick={() => setPages((count) => count + 1)}>
          Older messages
        </button>
      ) : null}
      {visible.map((item) => (
        <MessageView
          key={item.id}
          item={item}
          emotes={emotes}
          selfLogin={selfLogin}
          highlight={highlight}
        />
      ))}
      {hidden > 0 ? <p className="msg system">{hidden} hidden by your filter</p> : null}
    </div>
  );
}
