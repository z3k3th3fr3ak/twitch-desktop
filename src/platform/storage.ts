import { LazyStore } from "@tauri-apps/plugin-store";
import {
  parseSavedLayouts,
  parseWorkspace,
  type SavedLayout,
  type TileChannel,
  type Workspace,
} from "../core/layout";
import { EMPTY_SEEN, type SeenLive } from "../core/live";
import { DEFAULT_SETTINGS, parseSeen, parseSettings, type Settings } from "../state/settings";
import { isTauri } from "./backend";

export type Favorite = TileChannel & { avatar: string };

export type Persisted = {
  settings: Settings;
  favorites: Favorite[];
  workspace: Workspace | null;
  savedLayouts: SavedLayout[];
  seen: SeenLive;
};

const BROWSER_KEY = "glint.preview";

let store: LazyStore | null = null;

function desktopStore(): LazyStore {
  store ??= new LazyStore("glint.json");
  return store;
}

function parseFavorites(value: unknown): Favorite[] {
  if (!Array.isArray(value)) return [];
  const favorites: Favorite[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const tile = parseWorkspace({
      layout: "solo",
      tiles: [record],
      focus: 0,
    })?.tiles[0];
    if (!tile) continue;
    favorites.push({
      ...tile,
      avatar: typeof record.avatar === "string" ? record.avatar : "",
    });
  }
  return favorites;
}

export async function loadPersisted(): Promise<Persisted> {
  if (!isTauri()) {
    try {
      const raw = localStorage.getItem(BROWSER_KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        settings: parseSettings(parsed.settings),
        favorites: parseFavorites(parsed.favorites),
        workspace: parseWorkspace(parsed.workspace),
        savedLayouts: parseSavedLayouts(parsed.savedLayouts),
        seen: parseSeen(parsed.seen),
      };
    } catch {
      return blank();
    }
  }
  const desk = desktopStore();
  const [settings, favorites, workspace, savedLayouts, seen] = await Promise.all([
    desk.get<unknown>("settings"),
    desk.get<unknown>("favorites"),
    desk.get<unknown>("workspace"),
    desk.get<unknown>("savedLayouts"),
    desk.get<unknown>("seen"),
  ]);
  return {
    settings: parseSettings(settings),
    favorites: parseFavorites(favorites),
    workspace: parseWorkspace(workspace),
    savedLayouts: parseSavedLayouts(savedLayouts),
    seen: parseSeen(seen),
  };
}

export async function savePersisted(value: Persisted): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(BROWSER_KEY, JSON.stringify(value));
    return;
  }
  const desk = desktopStore();
  await desk.set("settings", value.settings);
  await desk.set("favorites", value.favorites);
  await desk.set("workspace", value.workspace);
  await desk.set("savedLayouts", value.savedLayouts);
  await desk.set("seen", value.seen);
  await desk.save();
}

function blank(): Persisted {
  return {
    settings: DEFAULT_SETTINGS,
    favorites: [],
    workspace: null,
    savedLayouts: [],
    seen: EMPTY_SEEN,
  };
}
