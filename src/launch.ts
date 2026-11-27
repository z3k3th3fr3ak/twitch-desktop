export type WindowKind = "main" | "overlay" | "popout";

export type Launch = {
  mode: WindowKind;
  channel: string | null;
  demo: boolean;
  mini: boolean;
};

export function readLaunch(search = window.location.search): Launch {
  const params = new URLSearchParams(search);
  const requested = params.get("window");
  const mode: WindowKind = requested === "overlay" || requested === "popout" ? requested : "main";
  const channel = params.get("channel");
  return {
    mode,
    channel: channel ? channel.toLowerCase() : null,
    demo: params.get("demo") === "1",
    mini: params.get("mini") === "1",
  };
}
