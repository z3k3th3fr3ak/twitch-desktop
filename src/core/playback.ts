export type AudioFollow = "follow" | "mini" | "focused";
export type AudioSurface = "grid" | "mini";
export type PlayerPlace = "tile" | "mini" | "hidden";

export type PlacedPlayer = {
  login: string;
  place: PlayerPlace;
  audible: boolean;
};

export type PlaybackInput = {
  grid: readonly string[];
  focused: string | null;
  mini: string | null;
  view: "watch" | "settings";
  audioFollow: AudioFollow;
  audioSurface: AudioSurface;
  armed: readonly string[];
  holdPlayback: boolean;
};

function unique(logins: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const login of logins) {
    if (!login || seen.has(login)) continue;
    seen.add(login);
    out.push(login);
  }
  return out;
}

export function handoffMini(
  previousFocused: string | null,
  previousGrid: readonly string[],
  nextGrid: readonly string[],
  nextFocused: string | null,
  currentMini: string | null,
): string | null {
  const next = new Set(nextGrid);
  const previous = new Set(previousGrid);
  let mini = currentMini && !next.has(currentMini) ? currentMini : null;
  const added = nextGrid.some((login) => !previous.has(login));
  if (added && previousFocused && previousFocused !== nextFocused && !next.has(previousFocused)) {
    mini = previousFocused;
  }
  if (mini === nextFocused) return null;
  return mini;
}

/** Keep existing iframes in their current DOM order. Reordering a frame reloads it. */
export function retainMountOrder(previous: readonly string[], next: readonly string[]): string[] {
  const wanted = new Set(next);
  const kept = previous.filter((login) => wanted.has(login));
  const added = next.filter((login) => !kept.includes(login));
  return [...kept, ...added];
}

/** A mounted channel keeps the src it was created with. */
export function stableSrc(
  mounted: ReadonlyMap<string, string>,
  players: readonly PlacedPlayer[],
): Map<string, string> {
  const next = new Map<string, string>();
  for (const player of players) {
    next.set(
      player.login,
      mounted.get(player.login) ?? `channel=${encodeURIComponent(player.login)}`,
    );
  }
  return next;
}

function chooseAudible(
  mode: AudioFollow,
  surface: AudioSurface,
  focused: string | null,
  mini: string | null,
): string | null {
  if (mode === "mini") return mini ?? focused;
  if (mode === "focused") return surface === "mini" ? (mini ?? focused) : focused;
  return focused;
}

export function planPlayback(input: PlaybackInput): PlacedPlayer[] {
  const grid = unique(input.grid);
  const focused = input.focused && grid.includes(input.focused) ? input.focused : null;
  const mini = input.mini && !grid.includes(input.mini) ? input.mini : null;
  const audible = chooseAudible(input.audioFollow, input.audioSurface, focused, mini);
  const showTiles = input.view === "watch";
  const allowed = (login: string) => !input.holdPlayback || input.armed.includes(login);
  const players: PlacedPlayer[] = [];

  for (const login of grid) {
    if (!allowed(login)) continue;
    players.push({
      login,
      place: showTiles ? "tile" : "hidden",
      audible: login === audible,
    });
  }
  if (mini && allowed(mini) && !players.some((player) => player.login === mini)) {
    players.push({ login: mini, place: showTiles ? "mini" : "hidden", audible: mini === audible });
  }
  if (!showTiles && players.length > 0) {
    const visible =
      players.find((player) => player.audible) ??
      players.find((player) => player.login === mini) ??
      players[0];
    for (const player of players) {
      player.place = player === visible ? "mini" : "hidden";
    }
  }
  return players;
}

/** A channel that stays in the plan keeps the same iframe. Focus, audio, and view do not remove it. */
export function retainedPlayers(
  before: readonly PlacedPlayer[],
  after: readonly PlacedPlayer[],
): string[] {
  const still = new Set(after.map((player) => player.login));
  return before.map((player) => player.login).filter((login) => still.has(login));
}
