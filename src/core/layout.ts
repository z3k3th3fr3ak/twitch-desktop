export type GridLayout = "solo" | "duo" | "trio" | "quad" | "six";

export type TileChannel = {
  login: string;
  userId: string;
  displayName: string;
};

export type Workspace = {
  layout: GridLayout;
  tiles: Array<TileChannel | null>;
  focus: number;
};

export type SavedLayout = {
  id: string;
  name: string;
  workspace: Workspace;
};

const LAYOUTS: readonly GridLayout[] = ["solo", "duo", "trio", "quad", "six"];

export function isGridLayout(value: string): value is GridLayout {
  return LAYOUTS.some((layout) => layout === value);
}

export function slotCount(layout: GridLayout): number {
  switch (layout) {
    case "solo":
      return 1;
    case "duo":
      return 2;
    case "trio":
      return 3;
    case "quad":
      return 4;
    case "six":
      return 6;
  }
}

export function layoutLabel(layout: GridLayout): string {
  switch (layout) {
    case "solo":
      return "1 stream";
    case "duo":
      return "2 streams";
    case "trio":
      return "3 streams";
    case "quad":
      return "4 streams";
    case "six":
      return "6 streams";
  }
}

export function asTileChannel(value: unknown): TileChannel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const login = typeof record.login === "string" ? record.login.trim().toLowerCase() : "";
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (!/^[a-z0-9_]{1,25}$/.test(login) || !/^[0-9]{1,20}$/.test(userId)) return null;
  return { login, userId, displayName: (displayName || login).slice(0, 40) };
}

export function emptyWorkspace(layout: GridLayout = "duo"): Workspace {
  return {
    layout,
    tiles: Array.from({ length: slotCount(layout) }, () => null),
    focus: 0,
  };
}

export function normalizeWorkspace(workspace: Workspace): Workspace {
  const layout = isGridLayout(workspace.layout) ? workspace.layout : "duo";
  const count = slotCount(layout);
  const seen = new Set<string>();
  const tiles: Array<TileChannel | null> = [];
  for (let index = 0; index < count; index += 1) {
    const tile = asTileChannel(workspace.tiles[index]);
    if (!tile || seen.has(tile.login)) {
      tiles.push(null);
      continue;
    }
    seen.add(tile.login);
    tiles.push(tile);
  }
  const focus = workspace.focus >= 0 && workspace.focus < count ? workspace.focus : 0;
  return { layout, tiles, focus };
}

export function setWorkspaceLayout(workspace: Workspace, layout: GridLayout): Workspace {
  return normalizeWorkspace({ ...workspace, layout });
}

export function focusTile(workspace: Workspace, index: number): Workspace {
  if (index < 0 || index >= slotCount(workspace.layout) || index === workspace.focus)
    return workspace;
  return { ...workspace, focus: index };
}

export function placeChannel(workspace: Workspace, index: number, channel: TileChannel): Workspace {
  const count = slotCount(workspace.layout);
  const tile = asTileChannel(channel);
  if (!tile || index < 0 || index >= count) return workspace;
  const tiles = workspace.tiles.map((current, tileIndex) => {
    if (tileIndex === index) return tile;
    if (current?.login === tile.login) return null;
    return current;
  });
  return normalizeWorkspace({ ...workspace, tiles, focus: index });
}

export function openChannel(workspace: Workspace, channel: TileChannel): Workspace {
  const tile = asTileChannel(channel);
  if (!tile) return workspace;
  const existing = workspace.tiles.findIndex((item) => item?.login === tile.login);
  if (existing >= 0) return focusTile(workspace, existing);
  if (!workspace.tiles[workspace.focus]) return placeChannel(workspace, workspace.focus, tile);
  const empty = workspace.tiles.findIndex((item) => item == null);
  if (empty >= 0) return placeChannel(workspace, empty, tile);
  return placeChannel(workspace, workspace.focus, tile);
}

export function clearTile(workspace: Workspace, index: number): Workspace {
  if (index < 0 || index >= workspace.tiles.length || !workspace.tiles[index]) return workspace;
  const tiles = workspace.tiles.map((tile, tileIndex) => (tileIndex === index ? null : tile));
  return normalizeWorkspace({ ...workspace, tiles });
}

export function moveTile(workspace: Workspace, from: number, to: number): Workspace {
  const count = slotCount(workspace.layout);
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return workspace;
  const tiles = workspace.tiles.slice();
  const moving = tiles[from] ?? null;
  tiles[from] = tiles[to] ?? null;
  tiles[to] = moving;
  let focus = workspace.focus;
  if (focus === from) focus = to;
  else if (focus === to) focus = from;
  return normalizeWorkspace({ ...workspace, tiles, focus });
}

/** Sound belongs to the focused tile, and only when that tile has a channel. */
export function listeningIndex(workspace: Workspace): number | null {
  return workspace.tiles[workspace.focus] ? workspace.focus : null;
}

export function focusedChannel(workspace: Workspace): TileChannel | null {
  return workspace.tiles[workspace.focus] ?? null;
}

export function channelsInWorkspace(workspace: Workspace): TileChannel[] {
  return workspace.tiles.filter((tile): tile is TileChannel => tile != null);
}

export function saveNamedLayout(
  existing: readonly SavedLayout[],
  name: string,
  workspace: Workspace,
): SavedLayout[] {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!trimmed || workspace.tiles.every((tile) => tile == null)) return [...existing];
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const saved: SavedLayout = {
    id: `${slug || "layout"}-${workspace.layout}`,
    name: trimmed,
    workspace: normalizeWorkspace(workspace),
  };
  const without = existing.filter(
    (layout) => layout.id !== saved.id && layout.name.toLowerCase() !== trimmed.toLowerCase(),
  );
  return [saved, ...without].slice(0, 12);
}

export function removeNamedLayout(existing: readonly SavedLayout[], id: string): SavedLayout[] {
  return existing.filter((layout) => layout.id !== id);
}

export function parseWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const layout = typeof record.layout === "string" ? record.layout : "";
  if (!isGridLayout(layout)) return null;
  const tiles = Array.isArray(record.tiles) ? record.tiles : [];
  const focus = typeof record.focus === "number" ? record.focus : 0;
  return normalizeWorkspace({ layout, tiles: tiles.map((tile) => asTileChannel(tile)), focus });
}

export function parseSavedLayouts(value: unknown): SavedLayout[] {
  if (!Array.isArray(value)) return [];
  const layouts: SavedLayout[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const id = typeof record.id === "string" ? record.id : "";
    const workspace = parseWorkspace(record.workspace);
    if (!name || !id || !workspace) continue;
    layouts.push({ id, name: name.slice(0, 40), workspace });
    if (layouts.length >= 12) break;
  }
  return layouts;
}
