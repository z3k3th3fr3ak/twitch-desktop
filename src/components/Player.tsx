import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { embedParents, playerFrameSrc } from "../core/embed";
import type { TwitchPlayerInstance } from "../twitch";

export type PlayerHandle = {
  listen: () => void;
  mute: () => void;
  qualities: () => string[];
  setQuality: (quality: string) => void;
  latency: () => number | null;
};

type PlayerProps = {
  channel: string;
  listen: boolean;
  /** When false, no Twitch script or iframe is created. */
  enabled?: boolean;
  autoplay?: boolean;
  demo?: boolean;
};

const playerHandles = new Map<string, PlayerHandle>();

export function playerHandle(login: string): PlayerHandle | null {
  return playerHandles.get(login) ?? null;
}

let embedLoader: Promise<void> | null = null;

function loadEmbed(): Promise<void> {
  if (window.Twitch?.Player) return Promise.resolve();
  embedLoader ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-twitch-embed]");
    const script = existing ?? document.createElement("script");
    script.src = "https://player.twitch.tv/js/embed/v1.js";
    script.async = true;
    script.dataset.twitchEmbed = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("embed")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
  return embedLoader;
}

function call(player: TwitchPlayerInstance | null, action: (player: TwitchPlayerInstance) => void) {
  if (!player) return;
  try {
    action(player);
  } catch {
    // The official embed throws if it is not ready for that call.
  }
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player(
  { channel, listen, enabled = true, autoplay = true, demo },
  ref,
) {
  const hostId = `twitch-${useId().replace(/:/g, "")}`;
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const listenRef = useRef(listen);
  const createRef = useRef({ autoplay, enabled });
  const [failed, setFailed] = useState(false);
  listenRef.current = listen;
  const fallbackSrc = useMemo(
    () =>
      playerFrameSrc(channel, embedParents(window.location.hostname), {
        autoplay: createRef.current.autoplay,
        muted: !listenRef.current,
      }),
    [channel],
  );

  useImperativeHandle(ref, () => ({
    listen() {
      call(playerRef.current, (player) => {
        player.setMuted(false);
        player.setVolume(1);
        player.play();
      });
    },
    mute() {
      call(playerRef.current, (player) => player.setMuted(true));
    },
    qualities() {
      try {
        return playerRef.current?.getQualities() ?? [];
      } catch {
        return [];
      }
    },
    setQuality(quality: string) {
      call(playerRef.current, (player) => player.setQuality(quality));
    },
    latency() {
      try {
        const value = playerRef.current?.getPlaybackStats()?.hlsLatencyBroadcaster;
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    const handle: PlayerHandle = {
      listen() {
        call(playerRef.current, (player) => {
          player.setMuted(false);
          player.setVolume(1);
          player.play();
        });
      },
      mute() {
        call(playerRef.current, (player) => {
          player.setMuted(true);
          player.setVolume(0);
        });
      },
      qualities() {
        try {
          return playerRef.current?.getQualities() ?? [];
        } catch {
          return [];
        }
      },
      setQuality(quality: string) {
        call(playerRef.current, (player) => player.setQuality(quality));
      },
      latency() {
        try {
          const value = playerRef.current?.getPlaybackStats()?.hlsLatencyBroadcaster;
          return typeof value === "number" && Number.isFinite(value) ? value : null;
        } catch {
          return null;
        }
      },
    };
    playerHandles.set(channel, handle);
    return () => {
      if (playerHandles.get(channel) === handle) playerHandles.delete(channel);
    };
  }, [channel]);

  useEffect(() => {
    if (demo || !createRef.current.enabled) return;
    let cancelled = false;
    const parents = embedParents(window.location.hostname);
    const shouldPlay = createRef.current.autoplay;
    setFailed(false);
    void loadEmbed()
      .then(() => {
        if (cancelled || !window.Twitch) return;
        const node = document.getElementById(hostId);
        if (!node) return;
        node.replaceChildren();
        const player = new window.Twitch.Player(hostId, {
          width: "100%",
          height: "100%",
          channel,
          parent: parents,
          autoplay: shouldPlay,
          muted: !listenRef.current,
        });
        playerRef.current = player;
        if (shouldPlay && listenRef.current) {
          player.addEventListener(window.Twitch.Player.READY, () => {
            if (!cancelled && listenRef.current) {
              player.setMuted(false);
              player.play();
            }
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        try {
          player.setMuted(true);
          player.pause();
        } catch {
          // The embed may already be gone.
        }
      }
      const node = document.getElementById(hostId);
      if (node) node.replaceChildren();
    };
  }, [channel, demo, hostId]);

  useEffect(() => {
    if (listen) {
      call(playerRef.current, (player) => {
        player.setMuted(false);
        player.setVolume(1);
        player.play();
      });
    } else {
      call(playerRef.current, (player) => {
        player.setMuted(true);
        player.setVolume(0);
      });
    }
  }, [listen]);

  if (demo) {
    return (
      <div className={`demo-stage tone-${channel}`}>
        <span>Live</span>
        <strong>{channel}</strong>
        <em>Official player sits here</em>
      </div>
    );
  }
  if (!enabled) {
    return null;
  }
  if (failed) {
    return (
      <iframe
        title={`${channel} on Twitch`}
        src={fallbackSrc}
        allowFullScreen
        allow="autoplay; fullscreen"
      />
    );
  }
  return <div id={hostId} className="player-host" />;
});
