export type EmoteSource = "twitch" | "7tv" | "bttv" | "ffz";

export type Emote = {
  id: string;
  name: string;
  source: EmoteSource;
  url: string;
};

export type Fragment =
  | { type: "text"; text: string }
  | { type: "emote"; text: string; emote: Emote };

type CodePoint = {
  cp: string;
  index: number;
  byteStart: number;
  byteEnd: number;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function utf8Length(codePoint: string): number {
  const value = codePoint.codePointAt(0) ?? 0;
  if (value <= 0x7f) return 1;
  if (value <= 0x7ff) return 2;
  if (value <= 0xffff) return 3;
  return 4;
}

function codePoints(message: string): CodePoint[] {
  const points: CodePoint[] = [];
  let byte = 0;
  let index = 0;
  for (const cp of message) {
    const size = utf8Length(cp);
    points.push({ cp, index, byteStart: byte, byteEnd: byte + size - 1 });
    byte += size;
    index += cp.length;
  }
  return points;
}

export function sliceByUtf8Bytes(
  message: string,
  start: number,
  endInclusive: number,
): { index: number; text: string } | null {
  if (endInclusive < start || start < 0) return null;
  const points = codePoints(message);
  const first = points.find((point) => point.byteStart === start);
  const last = points.find((point) => point.byteEnd === endInclusive);
  if (!first || !last || last.index < first.index) return null;
  const endIndex = last.index + last.cp.length;
  return { index: first.index, text: message.slice(first.index, endIndex) };
}

export type EmoteRange = { id: string; start: number; end: number };

export function parseTwitchEmoteTag(tag: string): EmoteRange[] {
  if (!tag) return [];
  const ranges: EmoteRange[] = [];
  for (const part of tag.split("/")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const id = part.slice(0, colon);
    const locations = part.slice(colon + 1);
    for (const location of locations.split(",")) {
      const [rawStart, rawEnd] = location.split("-");
      const start = Number(rawStart);
      const end = Number(rawEnd);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) continue;
      ranges.push({ id, start, end });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  return ranges;
}

function sevenTvUrl(id: string, hostUrl: string): string {
  if (!hostUrl) return `https://cdn.7tv.app/emote/${id}/2x.webp`;
  const absolute = hostUrl.startsWith("//") ? `https:${hostUrl}` : hostUrl;
  return `${absolute.replace(/\/$/, "")}/2x.webp`;
}

export function parse7tvEmotes(body: unknown): Emote[] {
  const root = record(body);
  if (!root) return [];
  const set = record(root.emote_set);
  const list = Array.isArray(root.emotes)
    ? root.emotes
    : set && Array.isArray(set.emotes)
      ? set.emotes
      : [];
  const emotes: Emote[] = [];
  for (const raw of list) {
    const emote = record(raw);
    if (!emote) continue;
    const data = record(emote.data);
    const name = text(emote.name);
    const id = text(emote.id) || (data ? text(data.id) : "");
    if (!name || !id || /\s/.test(name)) continue;
    const host = data ? record(data.host) : null;
    emotes.push({
      id,
      name,
      source: "7tv",
      url: sevenTvUrl(id, host ? text(host.url) : ""),
    });
  }
  return emotes;
}

export function parseBttvEmotes(body: unknown): Emote[] {
  const root = record(body);
  const list = Array.isArray(body)
    ? body
    : [
        ...(root && Array.isArray(root.channelEmotes) ? root.channelEmotes : []),
        ...(root && Array.isArray(root.sharedEmotes) ? root.sharedEmotes : []),
      ];
  const emotes: Emote[] = [];
  for (const raw of list) {
    const emote = record(raw);
    if (!emote) continue;
    const id = text(emote.id);
    const name = text(emote.code);
    if (!id || !name || /\s/.test(name)) continue;
    emotes.push({
      id,
      name,
      source: "bttv",
      url: `https://cdn.betterttv.net/emote/${id}/2x`,
    });
  }
  return emotes;
}

export function parseFfzEmotes(body: unknown): Emote[] {
  const root = record(body);
  const sets = root ? record(root.sets) : null;
  if (!sets) return [];
  const emotes: Emote[] = [];
  for (const set of Object.values(sets)) {
    const rec = record(set);
    if (!rec || !Array.isArray(rec.emoticons)) continue;
    for (const raw of rec.emoticons) {
      const emote = record(raw);
      if (!emote) continue;
      const name = text(emote.name);
      const id = emote.id == null ? "" : String(emote.id);
      const urls = record(emote.urls);
      if (!name || !id || !urls || /\s/.test(name)) continue;
      const url = text(urls["2"]) || text(urls["1"]) || text(urls["4"]);
      if (!url) continue;
      emotes.push({
        id,
        name,
        source: "ffz",
        url: url.startsWith("//") ? `https:${url}` : url,
      });
    }
  }
  return emotes;
}

export function mergeEmotes(groups: readonly (readonly Emote[])[]): Map<string, Emote> {
  const map = new Map<string, Emote>();
  for (const group of groups) {
    for (const emote of group) {
      if (!emote.name) continue;
      map.set(emote.name, emote);
    }
  }
  return map;
}

function fragmentPlain(textValue: string, thirdParty: ReadonlyMap<string, Emote>): Fragment[] {
  if (!textValue) return [];
  return textValue.split(/(\s+)/).map((part) => {
    const emote = thirdParty.get(part);
    if (!emote) return { type: "text", text: part };
    return { type: "emote", text: part, emote };
  });
}

export function fragmentMessage(
  message: string,
  emoteTag: string,
  thirdParty: ReadonlyMap<string, Emote>,
): Fragment[] {
  const placed = parseTwitchEmoteTag(emoteTag).flatMap((range) => {
    const slice = sliceByUtf8Bytes(message, range.start, range.end);
    return slice ? [{ id: range.id, index: slice.index, text: slice.text }] : [];
  });
  placed.sort((a, b) => a.index - b.index);

  const fragments: Fragment[] = [];
  let cursor = 0;
  for (const range of placed) {
    if (range.index < cursor) continue;
    if (range.index > cursor)
      fragments.push(...fragmentPlain(message.slice(cursor, range.index), thirdParty));
    fragments.push({
      type: "emote",
      text: range.text,
      emote: {
        id: range.id,
        name: range.text,
        source: "twitch",
        url: `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/2.0`,
      },
    });
    cursor = range.index + range.text.length;
  }
  if (cursor < message.length) fragments.push(...fragmentPlain(message.slice(cursor), thirdParty));
  return fragments.filter((fragment) => fragment.type !== "text" || fragment.text !== "");
}
