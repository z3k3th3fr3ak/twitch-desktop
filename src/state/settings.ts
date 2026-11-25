import type { NotifyMode, SeenLive } from "../core/live";

export type ThemeName = "ember" | "dusk";

export type Settings = {
  clientId: string;
  theme: ThemeName;
  notify: NotifyMode;
  filterText: string;
  mentionHighlight: boolean;
  overlayOpacity: number;
  clickThrough: boolean;
  autostart: boolean;
  hotkey: boolean;
  chatFontSize: number;
};

export const DEFAULT_SETTINGS: Settings = {
  clientId: "",
  theme: "ember",
  notify: "favorites",
  filterText: "",
  mentionHighlight: true,
  overlayOpacity: 0.78,
  clickThrough: false,
  autostart: false,
  hotkey: false,
  chatFontSize: 15,
};

export function parseSettings(value: unknown): Settings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const theme = record.theme === "dusk" ? "dusk" : "ember";
  const notify = record.notify === "all" || record.notify === "off" ? record.notify : "favorites";
  const opacity = typeof record.overlayOpacity === "number" ? record.overlayOpacity : 0.78;
  const font = typeof record.chatFontSize === "number" ? record.chatFontSize : 15;
  return {
    clientId: typeof record.clientId === "string" ? record.clientId.trim() : "",
    theme,
    notify,
    filterText: typeof record.filterText === "string" ? record.filterText : "",
    mentionHighlight: record.mentionHighlight !== false,
    overlayOpacity: Math.min(1, Math.max(0.35, opacity)),
    clickThrough: record.clickThrough === true,
    autostart: record.autostart === true,
    hotkey: record.hotkey === true,
    chatFontSize: Math.min(22, Math.max(12, font)),
  };
}

export function parseSeen(value: unknown): SeenLive {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sessions: Record<string, string> = {};
  const raw = record.sessions;
  if (raw && typeof raw === "object") {
    for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof item === "string" && /^[0-9]+$/.test(key)) sessions[key] = item;
    }
  }
  return { initialized: record.initialized === true, sessions };
}
