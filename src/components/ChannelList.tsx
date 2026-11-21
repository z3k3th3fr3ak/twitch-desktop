import type { ChannelHit } from "../core/helix";
import type { TileChannel } from "../core/layout";
import { formatUptime, formatViewers, type LiveStream } from "../core/live";
import type { Favorite } from "../platform/storage";

export function ChannelList({
  streams,
  favorites,
  query,
  hits,
  avatars,
  activeLogin,
  onQuery,
  onOpen,
  onToggleFavorite,
}: {
  streams: LiveStream[];
  favorites: Favorite[];
  query: string;
  hits: ChannelHit[];
  avatars: Record<string, string>;
  activeLogin: string | null;
  onQuery: (value: string) => void;
  onOpen: (channel: TileChannel) => void;
  onToggleFavorite: (channel: Favorite) => void;
}) {
  const liveIds = new Set(streams.map((stream) => stream.userId));
  const favoriteIds = new Set(favorites.map((favorite) => favorite.userId));
  return (
    <aside className="channels">
      <label className="search">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Find a channel"
        />
      </label>
      {query.trim() ? (
        <section>
          <h2>Results</h2>
          {hits.length === 0 ? <p className="empty">No channels yet.</p> : null}
          {hits.map((hit) => (
            <ChannelButton
              key={hit.userId}
              channel={{ login: hit.login, userId: hit.userId, displayName: hit.displayName }}
              avatar={hit.avatar}
              detail={hit.isLive ? hit.gameName || "Live" : "Offline"}
              live={hit.isLive}
              active={hit.login === activeLogin}
              favorite={favoriteIds.has(hit.userId)}
              onOpen={onOpen}
              onToggleFavorite={() =>
                onToggleFavorite({
                  login: hit.login,
                  userId: hit.userId,
                  displayName: hit.displayName,
                  avatar: hit.avatar,
                })
              }
            />
          ))}
        </section>
      ) : (
        <>
          <section>
            <h2>Favorites</h2>
            {favorites.length === 0 ? (
              <p className="empty">Star a channel to get a go-live toast for it.</p>
            ) : null}
            {favorites.map((favorite) => {
              const live = streams.find((stream) => stream.userId === favorite.userId);
              return (
                <ChannelButton
                  key={favorite.userId}
                  channel={favorite}
                  avatar={favorite.avatar || avatars[favorite.userId] || ""}
                  detail={live ? `${formatViewers(live.viewers)} · ${live.gameName}` : "Offline"}
                  live={liveIds.has(favorite.userId)}
                  active={favorite.login === activeLogin}
                  favorite
                  onOpen={onOpen}
                  onToggleFavorite={() => onToggleFavorite(favorite)}
                />
              );
            })}
          </section>
          <section>
            <h2>Live follows</h2>
            {streams.length === 0 ? <p className="empty">Nobody you follow is live.</p> : null}
            {streams.map((stream) => (
              <ChannelButton
                key={stream.userId}
                channel={{
                  login: stream.login,
                  userId: stream.userId,
                  displayName: stream.displayName,
                }}
                avatar={avatars[stream.userId] || ""}
                detail={`${formatViewers(stream.viewers)} · ${stream.gameName || "Live"} · ${formatUptime(stream.startedAt, Date.now())}`}
                live
                active={stream.login === activeLogin}
                favorite={favoriteIds.has(stream.userId)}
                onOpen={onOpen}
                onToggleFavorite={() =>
                  onToggleFavorite({
                    login: stream.login,
                    userId: stream.userId,
                    displayName: stream.displayName,
                    avatar: avatars[stream.userId] || "",
                  })
                }
              />
            ))}
          </section>
        </>
      )}
    </aside>
  );
}

function ChannelButton({
  channel,
  avatar,
  detail,
  live,
  active,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  channel: TileChannel;
  avatar: string;
  detail: string;
  live: boolean;
  active: boolean;
  favorite: boolean;
  onOpen: (channel: TileChannel) => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={active ? "channel active" : "channel"}>
      <button
        type="button"
        className="channel-main"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", `channel:${JSON.stringify(channel)}`);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onOpen(channel)}
      >
        {avatar ? (
          <img src={avatar} alt="" />
        ) : (
          <span className="avatar-fallback">{channel.displayName.slice(0, 1)}</span>
        )}
        <span>
          <strong>
            {live ? <i className="live-dot" /> : null}
            {channel.displayName}
          </strong>
          <small>{detail}</small>
        </span>
      </button>
      <button
        type="button"
        className={favorite ? "star on" : "star"}
        aria-label={
          favorite ? `Unfavorite ${channel.displayName}` : `Favorite ${channel.displayName}`
        }
        aria-pressed={favorite}
        onClick={onToggleFavorite}
      >
        ★
      </button>
    </div>
  );
}
