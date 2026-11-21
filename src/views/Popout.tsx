import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Player } from "../components/Player";
import type { Launch } from "../launch";
import { isTauri } from "../platform/backend";

export function Popout({ launch }: { launch: Launch }) {
  const channel = launch.channel ?? "twitch";
  const [pinned, setPinned] = useState(launch.mini);

  useEffect(() => {
    if (!isTauri()) return;
    void getCurrentWindow().setAlwaysOnTop(pinned);
  }, [pinned]);

  return (
    <div className="popout">
      <header>
        <strong>{channel}</strong>
        <button type="button" aria-pressed={pinned} onClick={() => setPinned((value) => !value)}>
          {pinned ? "Pinned" : "Pin"}
        </button>
      </header>
      <Player channel={channel} listen demo={launch.demo} />
    </div>
  );
}
