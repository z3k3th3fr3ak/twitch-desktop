import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
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
  demo?: boolean;
};

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
  { channel, listen, demo },
  ref,
) {
  const hostId = `twitch-${useId().replace(/:/g, "")}`;
  const playerRef = useRef<TwitchPlayerInstance | null>(null);
  const listenRef = useRef(listen);
  const [failed, setFailed] = useState(false);
  listenRef.current = listen;

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
    if (demo) return;
    let cancelled = false;
    const parent = window.location.hostname || "localhost";
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
          parent: [parent],
          autoplay: true,
          muted: !listenRef.current,
        });
        playerRef.current = player;
        if (listenRef.current) {
          player.addEventListener(window.Twitch.Player.READY, () => {
            if (listenRef.current) {
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
      playerRef.current = null;
      document.getElementById(hostId)?.replaceChildren();
    };
  }, [channel, demo, hostId]);

  useEffect(() => {
    if (listen) {
      call(playerRef.current, (player) => {
        player.setMuted(false);
        player.play();
      });
    } else {
      call(playerRef.current, (player) => player.setMuted(true));
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
  if (failed) {
    const parent = window.location.hostname || "localhost";
    const src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&autoplay=true&muted=${listen ? "false" : "true"}`;
    return (
      <iframe
        title={`${channel} on Twitch`}
        src={src}
        allowFullScreen
        allow="autoplay; fullscreen"
      />
    );
  }
  return <div id={hostId} className="player-host" />;
});
