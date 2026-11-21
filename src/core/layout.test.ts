import { describe, expect, it } from "vitest";
import {
  asTileChannel,
  clearTile,
  emptyWorkspace,
  focusedChannel,
  listeningIndex,
  moveTile,
  openChannel,
  placeChannel,
  removeNamedLayout,
  saveNamedLayout,
  setWorkspaceLayout,
  type TileChannel,
} from "./layout";

const harbor: TileChannel = { login: "harbor", userId: "1", displayName: "Harbor" };
const kiln: TileChannel = { login: "kiln", userId: "2", displayName: "Kiln" };
const north: TileChannel = { login: "northline", userId: "3", displayName: "Northline" };
const tide: TileChannel = { login: "lowtide", userId: "4", displayName: "Lowtide" };
const extra: TileChannel = { login: "extra", userId: "5", displayName: "Extra" };

describe("multi-view workspace", () => {
  it("rejects a channel that is not a Twitch login", () => {
    expect(asTileChannel({ login: "bad name", userId: "1", displayName: "X" })).toBeNull();
    expect(asTileChannel({ login: "Harbor", userId: "12", displayName: "Harbor" })?.login).toBe(
      "harbor",
    );
  });

  it("fills empty slots before replacing the one you are listening to", () => {
    const first = openChannel(emptyWorkspace("quad"), harbor);
    expect(first.tiles.map((tile) => tile?.login ?? null)).toEqual(["harbor", null, null, null]);
    expect(listeningIndex(first)).toBe(0);
    const second = openChannel(first, kiln);
    expect(second.tiles.map((tile) => tile?.login ?? null)).toEqual(["harbor", "kiln", null, null]);
    expect(focusedChannel(second)?.login).toBe("kiln");
    expect(listeningIndex(second)).toBe(1);
  });

  it("focuses a channel that is already on the grid instead of duplicating it", () => {
    const grid = openChannel(openChannel(emptyWorkspace("duo"), harbor), kiln);
    const again = openChannel(grid, harbor);
    expect(again.tiles.map((tile) => tile?.login)).toEqual(["harbor", "kiln"]);
    expect(again.focus).toBe(0);
    expect(listeningIndex(again)).toBe(0);
  });

  it("replaces the focused tile once every slot is full", () => {
    let grid = emptyWorkspace("duo");
    grid = openChannel(grid, harbor);
    grid = openChannel(grid, kiln);
    grid = { ...grid, focus: 0 };
    const replaced = openChannel(grid, north);
    expect(replaced.tiles.map((tile) => tile?.login)).toEqual(["northline", "kiln"]);
    expect(replaced.focus).toBe(0);
  });

  it("moves a dragged tile and keeps audio on that channel", () => {
    let grid = emptyWorkspace("quad");
    for (const channel of [harbor, kiln, north, tide]) grid = openChannel(grid, channel);
    grid = { ...grid, focus: 0 };
    const moved = moveTile(grid, 0, 3);
    expect(moved.tiles.map((tile) => tile?.login)).toEqual([
      "lowtide",
      "kiln",
      "northline",
      "harbor",
    ]);
    expect(focusedChannel(moved)?.login).toBe("harbor");
    expect(listeningIndex(moved)).toBe(3);
  });

  it("swaps with an empty slot and silences audio when the focused slot is cleared", () => {
    const grid = placeChannel(emptyWorkspace("duo"), 0, harbor);
    const swapped = moveTile(grid, 0, 1);
    expect(swapped.tiles.map((tile) => tile?.login ?? null)).toEqual([null, "harbor"]);
    expect(listeningIndex(swapped)).toBe(1);
    const cleared = clearTile(swapped, 1);
    expect(listeningIndex(cleared)).toBeNull();
  });

  it("keeps the leading tiles when a saved grid shrinks", () => {
    let grid = emptyWorkspace("six");
    for (const channel of [harbor, kiln, north, tide, extra]) grid = openChannel(grid, channel);
    const duo = setWorkspaceLayout({ ...grid, focus: 5 }, "duo");
    expect(duo.tiles).toHaveLength(2);
    expect(duo.tiles.map((tile) => tile?.login)).toEqual(["harbor", "kiln"]);
    expect(duo.focus).toBe(0);
  });
});

describe("saved layouts", () => {
  it("stores a named arrangement and replaces one with the same name", () => {
    const workspace = openChannel(openChannel(emptyWorkspace("quad"), harbor), kiln);
    const saved = saveNamedLayout([], " Evening grid ", workspace);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("Evening grid");
    expect(saved[0]?.workspace.layout).toBe("quad");
    const kept = saveNamedLayout(saved, "evening grid", emptyWorkspace("duo"));
    expect(kept[0]?.workspace.tiles[0]?.login).toBe("harbor");
    const updated = saveNamedLayout(
      saved,
      "evening grid",
      openChannel(emptyWorkspace("solo"), north),
    );
    expect(updated).toHaveLength(1);
    expect(updated[0]?.workspace.layout).toBe("solo");
    expect(updated[0]?.workspace.tiles[0]?.login).toBe("northline");
  });

  it("refuses an empty grid and caps the list at twelve", () => {
    expect(saveNamedLayout([], "Nope", emptyWorkspace("duo"))).toEqual([]);
    let layouts = saveNamedLayout([], "One", openChannel(emptyWorkspace("solo"), harbor));
    for (let index = 0; index < 14; index += 1) {
      layouts = saveNamedLayout(
        layouts,
        `Layout ${index}`,
        placeChannel(emptyWorkspace("solo"), 0, {
          ...harbor,
          login: `h${index}`,
          userId: String(index + 1),
        }),
      );
    }
    expect(layouts).toHaveLength(12);
    expect(removeNamedLayout(layouts, layouts[0]?.id ?? "")).toHaveLength(11);
  });
});
