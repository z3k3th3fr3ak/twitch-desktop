import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type AudioFollow, type PlacedPlayer, retainMountOrder } from "../core/playback";
import { setWindowAlwaysOnTop } from "../platform/windows";
import { Player } from "./Player";

type Rect = { left: number; top: number; width: number; height: number };

export function PlayerLayer({
  plan,
  demo,
  names,
  watchLayout,
  audioFollow,
  pinned,
  onTogglePin,
  onCloseMini,
  onListenMini,
  onActivate,
}: {
  plan: readonly PlacedPlayer[];
  demo: boolean;
  names: Record<string, string>;
  watchLayout: boolean;
  audioFollow: AudioFollow;
  pinned: boolean;
  onTogglePin: () => void;
  onCloseMini: () => void;
  onListenMini: () => void;
  onActivate: (login: string) => void;
}) {
  const orderRef = useRef<string[]>([]);
  const order = retainMountOrder(
    orderRef.current,
    plan.map((player) => player.login),
  );
  orderRef.current = order;
  const byLogin = new Map(plan.map((player) => [player.login, player]));
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const signature = plan.map((player) => `${player.login}:${player.place}`).join("|");
  const wantPin = pinned && plan.some((player) => player.place === "mini");

  useEffect(() => {
    void setWindowAlwaysOnTop(wantPin);
  }, [wantPin]);

  useEffect(
    () => () => {
      void setWindowAlwaysOnTop(false);
    },
    [],
  );

  useEffect(() => {
    const tiles = new Set(
      signature.split("|").flatMap((item) => {
        const split = item.indexOf(":");
        if (split < 0) return [];
        const login = item.slice(0, split);
        return item.slice(split + 1) === "tile" ? [login] : [];
      }),
    );
    const measure = () => {
      if (!watchLayout) {
        setRects((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }
      const next: Record<string, Rect> = {};
      for (const login of tiles) {
        const node = document.querySelector<HTMLElement>(`[data-channel="${CSS.escape(login)}"]`);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        next[login] = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
      setRects((current) => (sameRects(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    const mosaic = document.querySelector(".mosaic");
    if (mosaic) observer.observe(mosaic);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [signature, watchLayout]);

  return (
    <div className="player-layer">
      {order.map((login) => {
        const player = byLogin.get(login);
        if (!player) return null;
        return (
          <div
            key={login}
            className={`player-frame ${player.place}`}
            style={frameStyle(player, rects[login], watchLayout)}
          >
            <Player channel={login} listen={player.audible} autoplay demo={demo} />
            {player.place === "tile" && !player.audible ? (
              <button type="button" className="player-catch" onClick={() => onActivate(login)}>
                Click to listen
              </button>
            ) : null}
            {player.place === "mini" ? (
              <div className="mini-chrome">
                <strong>{names[login] ?? login}</strong>
                {audioFollow === "focused" ? (
                  <button type="button" onClick={onListenMini}>
                    {player.audible ? "Sound here" : "Listen"}
                  </button>
                ) : null}
                <button type="button" aria-pressed={pinned} onClick={onTogglePin}>
                  {pinned ? "Unpin" : "Above windows"}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${names[login] ?? login}`}
                  onClick={onCloseMini}
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function frameStyle(
  player: PlacedPlayer,
  rect: Rect | undefined,
  watchLayout: boolean,
): CSSProperties {
  if (player.place === "hidden" || (player.place === "tile" && !rect)) {
    return {
      position: "fixed",
      left: -4000,
      top: 0,
      width: 480,
      height: 270,
      visibility: "hidden",
      pointerEvents: "none",
    };
  }
  if (player.place === "mini") {
    return {
      position: "fixed",
      right: watchLayout ? "calc(var(--chat) + 16px)" : 16,
      bottom: 16,
      width: 400,
      height: 300,
      zIndex: 12,
    };
  }
  return {
    position: "fixed",
    left: rect?.left,
    top: rect?.top,
    width: rect?.width,
    height: rect?.height,
    zIndex: 3,
  };
}

function sameRects(current: Record<string, Rect>, next: Record<string, Rect>): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(current).length) return false;
  return keys.every((login) => {
    const prev = current[login];
    const rect = next[login];
    return (
      prev != null &&
      rect != null &&
      prev.left === rect.left &&
      prev.top === rect.top &&
      prev.width === rect.width &&
      prev.height === rect.height
    );
  });
}
