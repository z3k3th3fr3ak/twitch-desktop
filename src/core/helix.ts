import type { LiveStream } from "./live";

export type HelixPage<T> = { items: T[]; cursor: string | null };

export type TwitchUser = {
  userId: string;
  login: string;
  displayName: string;
  avatar: string;
};

export type ChannelHit = {
  userId: string;
  login: string;
  displayName: string;
  title: string;
  gameName: string;
  isLive: boolean;
  avatar: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cursorOf(body: unknown): string | null {
  const root = record(body);
  const pagination = root ? record(root.pagination) : null;
  const cursor = pagination ? text(pagination.cursor) : "";
  return cursor || null;
}

function rows(body: unknown): unknown[] {
  const root = record(body);
  return root && Array.isArray(root.data) ? root.data : [];
}

export function twitchThumbnail(template: string, width = 440, height = 248): string {
  return template.replaceAll("{width}", String(width)).replaceAll("{height}", String(height));
}

export function parseFollowedStreams(body: unknown): HelixPage<LiveStream> {
  const items: LiveStream[] = [];
  for (const raw of rows(body)) {
    const row = record(raw);
    if (!row) continue;
    const userId = text(row.user_id);
    const login = text(row.user_login).toLowerCase();
    const startedAt = text(row.started_at);
    if (!userId || !login || !startedAt) continue;
    items.push({
      streamId: text(row.id) || `${userId}:${startedAt}`,
      userId,
      login,
      displayName: text(row.user_name) || login,
      title: text(row.title),
      gameName: text(row.game_name),
      viewers: typeof row.viewer_count === "number" ? row.viewer_count : 0,
      startedAt,
      thumbnail: twitchThumbnail(text(row.thumbnail_url)),
      language: text(row.language),
    });
  }
  return { items, cursor: cursorOf(body) };
}

export function parseUsers(body: unknown): TwitchUser[] {
  const users: TwitchUser[] = [];
  for (const raw of rows(body)) {
    const row = record(raw);
    if (!row) continue;
    const userId = text(row.id);
    const login = text(row.login).toLowerCase();
    if (!userId || !login) continue;
    users.push({
      userId,
      login,
      displayName: text(row.display_name) || login,
      avatar: text(row.profile_image_url),
    });
  }
  return users;
}

export function parseChannelSearch(body: unknown): ChannelHit[] {
  const hits: ChannelHit[] = [];
  for (const raw of rows(body)) {
    const row = record(raw);
    if (!row) continue;
    const userId = text(row.id);
    const login = text(row.broadcaster_login).toLowerCase();
    if (!userId || !login) continue;
    hits.push({
      userId,
      login,
      displayName: text(row.display_name) || login,
      title: text(row.title),
      gameName: text(row.game_name),
      isLive: row.is_live === true,
      avatar: text(row.thumbnail_url),
    });
  }
  return hits;
}

export async function collectPages<T>(
  load: (cursor?: string) => Promise<HelixPage<T>>,
  limit = 5,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < limit; page += 1) {
    const next = await load(cursor);
    items.push(...next.items);
    if (!next.cursor || next.cursor === cursor) break;
    cursor = next.cursor;
  }
  return items;
}

export function helixErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    const root = record(parsed);
    const message = root ? text(root.message) : "";
    if (message) return message;
  } catch {
    // The body was not JSON. Fall through to the status line.
  }
  if (status === 401) return "Twitch rejected the sign-in. Sign in again.";
  return `Twitch returned HTTP ${status}.`;
}

export function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
