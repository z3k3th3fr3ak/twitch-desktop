import type { ReactNode } from "react";
import { type Emote, fragmentMessage } from "../core/emotes";
import { mentionsLogin } from "../core/filter";
import { nameColor, type VisibleChatItem } from "../core/irc";

const BADGE_LABEL: Record<string, string> = {
  broadcaster: "host",
  moderator: "mod",
  vip: "vip",
  subscriber: "sub",
};

export function MessageView({
  item,
  emotes,
  selfLogin,
  highlight,
}: {
  item: VisibleChatItem;
  emotes: ReadonlyMap<string, Emote>;
  selfLogin: string;
  highlight: boolean;
}) {
  if (item.kind === "system") {
    return <p className="msg system">{item.text}</p>;
  }
  const mention = highlight && item.login !== selfLogin && mentionsLogin(item.text, selfLogin);
  const fragments = fragmentMessage(item.text, item.emoteTag, emotes);
  return (
    <article className={mention ? "msg mention" : "msg"}>
      {item.parentDisplayName ? (
        <p className="reply">
          replying to {item.parentDisplayName}
          {item.parentBody ? `: ${item.parentBody}` : ""}
        </p>
      ) : null}
      <p>
        {item.badges.map((badge) => (
          <span key={badge} className="badge">
            {BADGE_LABEL[badge] ?? badge}
          </span>
        ))}
        <span className="name" style={{ color: nameColor(item.login, item.color) }}>
          {item.displayName}
        </span>
        {item.isAction ? <em> </em> : <span className="colon">: </span>}
        {
          fragments.reduce<{ nodes: ReactNode[]; offset: number }>(
            (state, fragment) => {
              const key = `${item.id}-${state.offset}-${fragment.type}`;
              const node =
                fragment.type === "text" ? (
                  <span key={key}>{fragment.text}</span>
                ) : (
                  <img
                    key={key}
                    className="emote"
                    alt={fragment.text}
                    title={`${fragment.text} · ${fragment.emote.source}`}
                    src={fragment.emote.url}
                  />
                );
              return {
                nodes: [...state.nodes, node],
                offset: state.offset + fragment.text.length + 1,
              };
            },
            { nodes: [], offset: 0 },
          ).nodes
        }
      </p>
    </article>
  );
}
