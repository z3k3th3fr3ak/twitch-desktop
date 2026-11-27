/** Hosts Twitch will accept in the embed `parent` parameter. The real page host is first. */
export function embedParents(hostname: string): string[] {
  const parents: string[] = [];
  const add = (value: string) => {
    const host = value.trim().toLowerCase().replace(/:\d+$/, "");
    if (!host || host.includes("/") || parents.includes(host)) return;
    parents.push(host);
  };
  add(hostname || "localhost");
  add("tauri.localhost");
  add("localhost");
  return parents;
}

/** Twitch only frames http pages when the host is localhost. `http://tauri.localhost` is refused. */
export function embedParentNeedsHttps(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

export function playerFrameSrc(
  channel: string,
  parents: readonly string[],
  options: { autoplay: boolean; muted: boolean },
): string {
  const params = new URLSearchParams();
  params.set("channel", channel);
  params.set("autoplay", options.autoplay ? "true" : "false");
  params.set("muted", options.muted ? "true" : "false");
  const parentQuery = parents.map((parent) => `parent=${encodeURIComponent(parent)}`).join("&");
  return `https://player.twitch.tv/?${params.toString()}&${parentQuery}`;
}
