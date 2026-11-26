import { describe, expect, it } from "vitest";
import {
  handoffMini,
  type PlaybackInput,
  planPlayback,
  retainedPlayers,
  retainMountOrder,
  stableSrc,
} from "./playback";

const base: PlaybackInput = {
  grid: ["harbor", "kiln"],
  focused: "harbor",
  mini: null,
  view: "watch",
  audioFollow: "follow",
  audioSurface: "grid",
  armed: [],
  holdPlayback: false,
};

describe("player lifecycle", () => {
  it("keeps every tile mounted and only moves audio when focus changes", () => {
    const before = planPlayback(base);
    const after = planPlayback({ ...base, focused: "kiln" });
    expect(after.map((player) => player.login)).toEqual(["harbor", "kiln"]);
    expect(retainedPlayers(before, after)).toEqual(["harbor", "kiln"]);
    expect(after.find((player) => player.login === "harbor")).toMatchObject({
      place: "tile",
      audible: false,
    });
    expect(after.find((player) => player.login === "kiln")).toMatchObject({
      place: "tile",
      audible: true,
    });
  });

  it("does not drop players when the view changes", () => {
    const before = planPlayback(base);
    const after = planPlayback({ ...base, view: "settings" });
    expect(retainedPlayers(before, after)).toEqual(["harbor", "kiln"]);
    expect(after.find((player) => player.login === "harbor")?.place).toBe("mini");
    expect(after.find((player) => player.login === "kiln")?.place).toBe("hidden");
  });

  it("parks the stream you leave into the mini player", () => {
    const mini = handoffMini(
      "harbor",
      ["harbor", "kiln"],
      ["northline", "kiln"],
      "northline",
      null,
    );
    expect(mini).toBe("harbor");
    const before = planPlayback(base);
    const src = stableSrc(new Map(), before);
    const plan = planPlayback({
      ...base,
      grid: ["northline", "kiln"],
      focused: "northline",
      mini,
      armed: ["northline", "kiln", "harbor"],
      holdPlayback: true,
    });
    const next = stableSrc(src, plan);
    expect(plan).toEqual([
      { login: "northline", place: "tile", audible: true },
      { login: "kiln", place: "tile", audible: false },
      { login: "harbor", place: "mini", audible: false },
    ]);
    expect(next.get("harbor")).toBe(src.get("harbor"));
    expect(next.get("kiln")).toBe(src.get("kiln"));
    expect(retainedPlayers(before, plan)).toEqual(["harbor", "kiln"]);
  });

  it("keeps the mini player when audio stays there", () => {
    const plan = planPlayback({
      ...base,
      grid: ["kiln"],
      focused: "kiln",
      mini: "harbor",
      audioFollow: "mini",
    });
    expect(plan.find((player) => player.login === "harbor")?.audible).toBe(true);
    expect(plan.find((player) => player.login === "kiln")?.audible).toBe(false);
  });

  it("mutes every surface except the one that has focus", () => {
    const shared = {
      ...base,
      grid: ["kiln"],
      focused: "kiln",
      mini: "harbor",
      audioFollow: "focused" as const,
    };
    const onGrid = planPlayback({ ...shared, audioSurface: "grid" });
    expect(onGrid.filter((player) => player.audible).map((player) => player.login)).toEqual([
      "kiln",
    ]);
    const onMini = planPlayback({ ...shared, audioSurface: "mini" });
    expect(onMini.filter((player) => player.audible).map((player) => player.login)).toEqual([
      "harbor",
    ]);
    expect(retainedPlayers(onGrid, onMini)).toEqual(["kiln", "harbor"]);
  });

  it("does not duplicate a channel that is still on the grid", () => {
    expect(handoffMini("harbor", ["harbor", "kiln"], ["harbor", "kiln"], "kiln", null)).toBeNull();
    expect(handoffMini("harbor", ["harbor"], ["harbor", "kiln"], "kiln", null)).toBeNull();
  });

  it("keeps the same src across focus, audio, and view changes", () => {
    const initial = planPlayback(base);
    const src = stableSrc(new Map(), initial);
    const harbor = src.get("harbor");
    const kiln = src.get("kiln");
    const plans = [
      planPlayback({ ...base, focused: "kiln" }),
      planPlayback({ ...base, audioFollow: "focused", audioSurface: "mini" }),
      planPlayback({ ...base, view: "settings" }),
    ];
    for (const plan of plans) {
      const next = stableSrc(src, plan);
      expect(retainedPlayers(initial, plan)).toEqual(["harbor", "kiln"]);
      expect(next.get("harbor")).toBe(harbor);
      expect(next.get("kiln")).toBe(kiln);
    }
  });

  it("does not reorder mounted players when the grid order changes", () => {
    expect(retainMountOrder(["harbor", "kiln"], ["kiln", "harbor"])).toEqual(["harbor", "kiln"]);
    expect(retainMountOrder(["harbor", "kiln"], ["kiln", "northline"])).toEqual([
      "kiln",
      "northline",
    ]);
  });

  it("leaves the mini muted when audio follows the new stream", () => {
    const plan = planPlayback({
      ...base,
      grid: ["kiln"],
      focused: "kiln",
      mini: "harbor",
      audioFollow: "follow",
      audioSurface: "mini",
    });
    expect(plan.find((player) => player.login === "kiln")?.audible).toBe(true);
    expect(plan.find((player) => player.login === "harbor")?.audible).toBe(false);
  });
});
