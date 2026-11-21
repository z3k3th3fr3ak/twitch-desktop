import {
  applyRefresh,
  assertClientMatch,
  type DevicePoll,
  type DeviceStart,
  devicePollBody,
  deviceStartBody,
  helixAuthorization,
  interpretDevicePoll,
  parseDeviceStart,
  parseValidate,
  REQUIRED_SCOPES,
  refreshBody,
  type StoredAuth,
  tokenNeedsRefresh,
  validateAuthorization,
} from "../core/auth";
import {
  type Emote,
  mergeEmotes,
  parse7tvEmotes,
  parseBttvEmotes,
  parseFfzEmotes,
} from "../core/emotes";
import {
  type EventSubFrame,
  eventsubSubscription,
  parseEventSub,
  subscriptionId,
} from "../core/eventsub";
import {
  type ChannelHit,
  chunk,
  collectPages,
  helixErrorMessage,
  parseChannelSearch,
  parseFollowedStreams,
  parseUsers,
} from "../core/helix";
import type { LiveStream } from "../core/live";
import { httpRequest } from "./backend";

type JsonResult = { status: number; json: unknown; raw: string };

async function request(
  method: "GET" | "POST" | "DELETE",
  url: string,
  headers: [string, string][],
  body?: string,
): Promise<JsonResult> {
  const response = await httpRequest({ method, url, headers, body });
  let json: unknown = null;
  if (response.body) {
    try {
      json = JSON.parse(response.body) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, raw: response.body };
}

function formHeaders(): [string, string][] {
  return [
    ["Content-Type", "application/x-www-form-urlencoded"],
    ["Accept", "application/json"],
  ];
}

export async function startDevice(clientId: string): Promise<DeviceStart> {
  const response = await request(
    "POST",
    "https://id.twitch.tv/oauth2/device",
    formHeaders(),
    deviceStartBody(clientId, REQUIRED_SCOPES),
  );
  if (response.status >= 400) throw new Error(helixErrorMessage(response.status, response.raw));
  return parseDeviceStart(response.json, Date.now());
}

export async function pollDevice(clientId: string, deviceCode: string): Promise<DevicePoll> {
  const response = await request(
    "POST",
    "https://id.twitch.tv/oauth2/token",
    formHeaders(),
    devicePollBody(clientId, REQUIRED_SCOPES, deviceCode),
  );
  return interpretDevicePoll(response.status, response.json, Date.now());
}

export async function refreshStored(clientId: string, current: StoredAuth): Promise<StoredAuth> {
  if (!tokenNeedsRefresh(current.expiresAt, Date.now())) return current;
  const response = await request(
    "POST",
    "https://id.twitch.tv/oauth2/token",
    formHeaders(),
    refreshBody(clientId, current.refreshToken),
  );
  if (response.status < 200 || response.status >= 300) {
    const interpreted = interpretDevicePoll(response.status, response.json, Date.now());
    if (interpreted.kind === "invalid" || interpreted.kind === "expired") {
      throw new Error("Your Twitch sign-in expired. Sign in again.");
    }
    throw new Error(helixErrorMessage(response.status, response.raw));
  }
  return applyRefresh(current, response.json, Date.now());
}

async function helix(
  clientId: string,
  token: string,
  path: string,
  query: Record<string, string | string[]> = {},
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: string,
): Promise<unknown> {
  const url = new URL(`https://api.twitch.tv/helix/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value) url.searchParams.set(key, value);
  }
  const headers: [string, string][] = [
    ["Client-Id", clientId],
    ["Authorization", helixAuthorization(token)],
    ["Accept", "application/json"],
  ];
  if (body) headers.push(["Content-Type", "application/json"]);
  const response = await request(method, url.toString(), headers, body);
  if (response.status >= 400) throw new Error(helixErrorMessage(response.status, response.raw));
  return response.json;
}

export async function completeLogin(clientId: string, token: StoredAuth): Promise<StoredAuth> {
  const validatedResponse = await request("GET", "https://id.twitch.tv/oauth2/validate", [
    ["Authorization", validateAuthorization(token.accessToken)],
  ]);
  if (validatedResponse.status >= 400) {
    throw new Error("Twitch did not accept the new sign-in.");
  }
  const validated = parseValidate(validatedResponse.json);
  assertClientMatch(validated, clientId);
  const users = parseUsers(await helix(clientId, token.accessToken, "users"));
  const profile = users[0];
  return {
    ...token,
    login: validated.login,
    userId: validated.userId,
    scopes: validated.scopes.length > 0 ? validated.scopes : token.scopes,
    displayName: profile?.displayName || validated.login,
    avatar: profile?.avatar || "",
  };
}

export async function fetchFollowedLive(clientId: string, auth: StoredAuth): Promise<LiveStream[]> {
  return collectPages((cursor) =>
    helix(clientId, auth.accessToken, "streams/followed", {
      user_id: auth.userId,
      first: "100",
      ...(cursor ? { after: cursor } : {}),
    }).then((body) => {
      const page = parseFollowedStreams(body);
      return { items: page.items, cursor: page.cursor };
    }),
  );
}

export async function fetchAvatars(
  clientId: string,
  auth: StoredAuth,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const avatars = new Map<string, string>();
  for (const group of chunk(userIds, 100)) {
    if (group.length === 0) continue;
    for (const user of parseUsers(
      await helix(clientId, auth.accessToken, "users", { id: [...group] }),
    )) {
      if (user.avatar) avatars.set(user.userId, user.avatar);
    }
  }
  return avatars;
}

export async function searchChannels(
  clientId: string,
  auth: StoredAuth,
  query: string,
): Promise<ChannelHit[]> {
  return parseChannelSearch(
    await helix(clientId, auth.accessToken, "search/channels", { query, first: "15" }),
  );
}

export async function createOnlineSubscription(
  clientId: string,
  auth: StoredAuth,
  broadcasterId: string,
  sessionId: string,
): Promise<string | null> {
  const body = await helix(
    clientId,
    auth.accessToken,
    "eventsub/subscriptions",
    {},
    "POST",
    JSON.stringify(eventsubSubscription("stream.online", broadcasterId, sessionId)),
  );
  return subscriptionId(body);
}

export async function deleteSubscription(
  clientId: string,
  auth: StoredAuth,
  id: string,
): Promise<void> {
  await helix(clientId, auth.accessToken, "eventsub/subscriptions", { id }, "DELETE");
}

const globalEmotes = { current: null as Map<string, Emote> | null };

async function publicJson(url: string): Promise<unknown | null> {
  try {
    const response = await request("GET", url, [["Accept", "application/json"]]);
    if (response.status >= 400) return null;
    return response.json;
  } catch {
    return null;
  }
}

async function loadGlobalEmotes(): Promise<Map<string, Emote>> {
  if (globalEmotes.current) return globalEmotes.current;
  const [seven, bttv, ffz] = await Promise.all([
    publicJson("https://7tv.io/v3/emote-sets/global"),
    publicJson("https://api.betterttv.net/3/cached/emotes/global"),
    publicJson("https://api.frankerfacez.com/v1/set/global"),
  ]);
  globalEmotes.current = mergeEmotes([
    parseFfzEmotes(ffz),
    parseBttvEmotes(bttv),
    parse7tvEmotes(seven),
  ]);
  return globalEmotes.current;
}

export async function loadChannelEmotes(userId: string): Promise<Map<string, Emote>> {
  const globals = await loadGlobalEmotes();
  const [seven, bttv, ffz] = await Promise.all([
    publicJson(`https://7tv.io/v3/users/twitch/${userId}`),
    publicJson(`https://api.betterttv.net/3/cached/users/twitch/${userId}`),
    publicJson(`https://api.frankerfacez.com/v1/room/id/${userId}`),
  ]);
  const channel = mergeEmotes([parseFfzEmotes(ffz), parseBttvEmotes(bttv), parse7tvEmotes(seven)]);
  return new Map<string, Emote>([...globals, ...channel]);
}

export function readEventSub(raw: string): EventSubFrame {
  return parseEventSub(raw);
}
