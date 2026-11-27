import { type DragEvent, useEffect, useRef, useState } from "react";
import type { Emote } from "../core/emotes";
import type { VisibleChatItem } from "../core/irc";
import {
  asTileChannel,
  everyTileChatOpen,
  focusedChannel,
  type GridLayout,
  layoutLabel,
  listeningIndex,
  type SavedLayout,
  slotCount,
  type TileChannel,
  tileChatOpen,
  videoSlotSize,
  type Workspace,
} from "../core/layout";
import { qualityLabel } from "../core/live";
import { playerHandle } from "./Player";
import { TileChat } from "./TileChat";

const LAYOUTS: GridLayout[] = ["solo", "duo", "trio", "quad", "six"];
const NO_EMOTES: ReadonlyMap<string, Emote> = new Map();

export function Mosaic({
  workspace,
  demo = false,
  liveLogins,
  audibleLogin,
  savedLayouts,
  onFocus,
  onMove,
  onPlace,
  onClear,
  onLayout,
  onSave,
  onRestore,
  onDelete,
  onPopout,
  onDockMini,
  onTileChat,
  onAllChats,
  messages,
  emotePacks,
  selfLogin,
  chatStatus,
  filterText,
  highlightMentions,
  chatFontSize,
  onSendChat,
}: {
  workspace: Workspace;
  demo?: boolean;
  liveLogins: readonly string[];
  audibleLogin: string | null;
  savedLayouts: SavedLayout[];
  onFocus: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onPlace: (index: number, channel: TileChannel) => void;
  onClear: (index: number) => void;
  onLayout: (layout: GridLayout) => void;
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onPopout: (channel: string) => void;
  onDockMini: () => void;
  onTileChat: (index: number, open: boolean) => void;
  onAllChats: (open: boolean) => void;
  messages: Record<string, VisibleChatItem[]>;
  emotePacks: Record<string, ReadonlyMap<string, Emote>>;
  selfLogin: string;
  chatStatus: string;
  filterText: string;
  highlightMentions: boolean;
  chatFontSize: number;
  onSendChat: (login: string, text: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [cramped, setCramped] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [qualities, setQualities] = useState<string[]>([]);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const focused = focusedChannel(workspace);
  const listening = listeningIndex(workspace);
  const audible =
    workspace.tiles.find((tile) => tile?.login === audibleLogin)?.displayName ??
    focused?.displayName ??
    null;

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      const columns = workspace.layout === "six" ? 3 : workspace.layout === "solo" ? 1 : 2;
      const rows = workspace.layout === "solo" || workspace.layout === "duo" ? 1 : 2;
      const tileWidth = node.clientWidth / columns;
      const tileHeight = node.clientHeight / rows;
      const chatOpen =
        workspace.layout === "quad" &&
        workspace.tiles.some((tile, index) => tile != null && tileChatOpen(workspace, index));
      const video = videoSlotSize(tileWidth, tileHeight, chatOpen);
      setCramped(video.width < 400 || video.height < 300);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [workspace]);

  useEffect(() => {
    const channel = focused?.login ?? "";
    if (demo || listening == null || channel === "") {
      setLatency(null);
      return;
    }
    const read = () => setLatency(playerHandle(channel)?.latency() ?? null);
    read();
    const id = window.setInterval(read, 5000);
    return () => window.clearInterval(id);
  }, [demo, listening, focused?.login]);

  function activate(index: number) {
    onFocus(index);
  }

  function acceptDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    if (raw.startsWith("tile:")) {
      const from = Number(raw.slice(5));
      if (Number.isInteger(from)) onMove(from, index);
      return;
    }
    if (!raw.startsWith("channel:")) return;
    try {
      const channel = asTileChannel(JSON.parse(raw.slice("channel:".length)) as unknown);
      if (channel) onPlace(index, channel);
    } catch {
      // A bad drag payload is ignored.
    }
  }

  return (
    <section className="stage">
      <div className="stage-bar">
        <fieldset className="layout-switch">
          <legend>Grid</legend>
          {LAYOUTS.map((layout) => (
            <button
              key={layout}
              type="button"
              aria-pressed={workspace.layout === layout}
              title={layoutLabel(layout)}
              onClick={() => onLayout(layout)}
            >
              {slotCount(layout)}
            </button>
          ))}
        </fieldset>
        <p className="listen-label">
          {audible ? (
            <>
              Listening to <strong>{audible}</strong>
            </>
          ) : (
            "Click a tile to give it audio"
          )}
          {latency != null ? <span className="latency">{latency.toFixed(1)}s latency</span> : null}
          {workspace.layout === "quad" ? <span className="latency">{chatStatus}</span> : null}
        </p>
        <div className="stage-actions">
          <button
            type="button"
            onClick={() => {
              const list = focused ? (playerHandle(focused.login)?.qualities() ?? []) : [];
              setQualities(list);
              setQualityOpen((open) => !open);
            }}
          >
            Quality
          </button>
          <button type="button" onClick={() => setLayoutsOpen((open) => !open)}>
            Layouts
          </button>
          {workspace.layout === "quad" ? (
            <button
              type="button"
              aria-pressed={everyTileChatOpen(workspace)}
              onClick={() => onAllChats(!everyTileChatOpen(workspace))}
            >
              {everyTileChatOpen(workspace) ? "Hide chats" : "Show chats"}
            </button>
          ) : null}
          <button type="button" disabled={!focused} onClick={onDockMini}>
            Mini
          </button>
          <button
            type="button"
            disabled={!focused}
            onClick={() => focused && onPopout(focused.login)}
          >
            Pop out
          </button>
        </div>
        {qualityOpen ? (
          <div className="flyout quality-flyout">
            {qualities.length === 0 ? (
              <p>
                The official player has not listed qualities yet. Use its gear menu, which is the
                same control.
              </p>
            ) : (
              qualities.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  onClick={() => {
                    if (focused) playerHandle(focused.login)?.setQuality(quality);
                    setQualityOpen(false);
                  }}
                >
                  {qualityLabel(quality)}
                </button>
              ))
            )}
          </div>
        ) : null}
        {layoutsOpen ? (
          <div className="flyout layout-flyout">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSave(layoutName);
                setLayoutName("");
              }}
            >
              <input
                value={layoutName}
                onChange={(event) => setLayoutName(event.target.value)}
                placeholder="Name this grid"
                aria-label="Layout name"
                maxLength={40}
              />
              <button type="submit">Save</button>
            </form>
            {savedLayouts.length === 0 ? <p>No saved layouts yet.</p> : null}
            <ul>
              {savedLayouts.map((layout) => (
                <li key={layout.id}>
                  <button type="button" onClick={() => onRestore(layout.id)}>
                    {layout.name}
                    <small>{layoutLabel(layout.workspace.layout)}</small>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${layout.name}`}
                    onClick={() => onDelete(layout.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {cramped ? (
        <p className="cramped">
          Twitch’s player wants each video at least 400×300. This grid is tighter than that, so a
          tile may stay blank until the window is larger.
          {workspace.layout === "quad"
            ? " Hiding a chat gives that stream the whole quadrant."
            : ""}
        </p>
      ) : null}
      <div ref={frame} className="mosaic" data-layout={workspace.layout}>
        {workspace.tiles.map((tile, index) => {
          const focusedTile = index === workspace.focus;
          const quad = workspace.layout === "quad";
          const chatOpen = quad && tile != null && tileChatOpen(workspace, index);
          return (
            <article
              key={tile?.login ?? `empty-${index}`}
              className={
                focusedTile
                  ? `tile focus${chatOpen ? " chat-open" : ""}`
                  : `tile${chatOpen ? " chat-open" : ""}`
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => acceptDrop(event, index)}
            >
              <header className="tile-bar">
                <button
                  type="button"
                  className="grip"
                  draggable={tile != null}
                  aria-label={tile ? `Drag ${tile.displayName}` : "Empty slot"}
                  disabled={!tile}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", `tile:${index}`);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  ⋮⋮
                </button>
                <button type="button" className="tile-name" onClick={() => activate(index)}>
                  {tile ? tile.displayName : "Empty slot"}
                  {tile && audibleLogin === tile.login ? (
                    <span className="speaker">sound</span>
                  ) : null}
                </button>
                {quad && tile && !chatOpen ? (
                  <button
                    type="button"
                    className="tile-chat-show"
                    aria-label={`Show chat for ${tile.displayName}`}
                    onClick={() => onTileChat(index, true)}
                  >
                    Chat
                  </button>
                ) : null}
                {tile ? (
                  <button
                    type="button"
                    className="tile-close"
                    aria-label={`Remove ${tile.displayName}`}
                    onClick={() => onClear(index)}
                  >
                    ×
                  </button>
                ) : null}
              </header>
              {tile && liveLogins.includes(tile.login) ? (
                <div className="tile-hole" data-channel={tile.login} />
              ) : tile ? (
                <button type="button" className="tile-poster" onClick={() => activate(index)}>
                  {focusedTile ? "Click to play" : "Click to listen"}
                </button>
              ) : (
                <button type="button" className="tile-empty" onClick={() => onFocus(index)}>
                  Drop a channel here, or select this slot and click one in the list.
                </button>
              )}
              {chatOpen && tile ? (
                <TileChat
                  channel={tile.login}
                  displayName={tile.displayName}
                  items={messages[tile.login] ?? []}
                  emotes={emotePacks[tile.userId] ?? NO_EMOTES}
                  selfLogin={selfLogin}
                  filterText={filterText}
                  highlight={highlightMentions}
                  fontSize={chatFontSize}
                  onSend={(text) => onSendChat(tile.login, text)}
                  onHide={() => onTileChat(index, false)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
