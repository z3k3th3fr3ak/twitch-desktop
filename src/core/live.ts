export type LiveStream = {
  streamId: string;
  userId: string;
  login: string;
  displayName: string;
  title: string;
  gameName: string;
  viewers: number;
  startedAt: string;
  thumbnail: string;
  language: string;
};

export type NotifyMode = "favorites" | "all" | "off";

export type SeenLive = {
  initialized: boolean;
  sessions: Record<string, string>;
};

export const EMPTY_SEEN: SeenLive = { initialized: false, sessions: {} };

export function diffLive(
  previous: SeenLive,
  streams: readonly LiveStream[],
  mode: NotifyMode,
  favoriteIds: ReadonlySet<string>,
): { next: SeenLive; notify: LiveStream[] } {
  const unique: LiveStream[] = [];
  const seenIds = new Set<string>();
  for (const stream of streams) {
    if (seenIds.has(stream.userId)) continue;
    seenIds.add(stream.userId);
    unique.push(stream);
  }
  const sessions: Record<string, string> = {};
  for (const stream of unique) sessions[stream.userId] = stream.startedAt;
  if (!previous.initialized) return { next: { initialized: true, sessions }, notify: [] };

  const notify: LiveStream[] = [];
  if (mode !== "off") {
    for (const stream of unique) {
      if (previous.sessions[stream.userId] === stream.startedAt) continue;
      if (mode === "favorites" && !favoriteIds.has(stream.userId)) continue;
      notify.push(stream);
    }
  }
  return { next: { initialized: true, sessions }, notify };
}

export function noteLive(
  previous: SeenLive,
  stream: LiveStream,
  mode: NotifyMode,
  favoriteIds: ReadonlySet<string>,
): { next: SeenLive; notify: boolean } {
  const sessions = { ...previous.sessions, [stream.userId]: stream.startedAt };
  if (!previous.initialized) return { next: { initialized: true, sessions }, notify: false };
  if (previous.sessions[stream.userId] === stream.startedAt) {
    return { next: { initialized: true, sessions }, notify: false };
  }
  const allowed = mode === "all" || (mode === "favorites" && favoriteIds.has(stream.userId));
  return { next: { initialized: true, sessions }, notify: allowed };
}

export function formatViewers(viewers: number): string {
  if (!Number.isFinite(viewers) || viewers < 0) return "0";
  if (viewers < 1000) return String(Math.floor(viewers));
  if (viewers < 10_000) {
    const value = (viewers / 1000).toFixed(1);
    return `${value.endsWith(".0") ? value.slice(0, -2) : value}k`;
  }
  if (viewers < 1_000_000) return `${Math.round(viewers / 1000)}k`;
  const millions = (viewers / 1_000_000).toFixed(1);
  return `${millions.endsWith(".0") ? millions.slice(0, -2) : millions}m`;
}

export function formatUptime(startedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start) || start > now) return "";
  const minutes = Math.floor((now - start) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}m`;
  return `${hours}h ${rest}m`;
}

export function qualityLabel(quality: string): string {
  const value = quality.toLowerCase();
  if (value === "chunked" || value === "source") return "Source";
  if (value === "auto") return "Auto";
  return quality;
}
