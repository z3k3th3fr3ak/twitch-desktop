import { disable, enable } from "@tauri-apps/plugin-autostart";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DeviceStart,
  missingScopes,
  nextPollDelay,
  parseStoredAuth,
  REQUIRED_SCOPES,
  type StoredAuth,
  validateClientId,
} from "../core/auth";
import type { Emote } from "../core/emotes";
import { channelsForEventSub, streamOnlineFromEvent } from "../core/eventsub";
import { nextSendAt } from "../core/filter";
import type { ChannelHit } from "../core/helix";
import { chatEventFromIrc, parseIrcLine, reduceChannel, type VisibleChatItem } from "../core/irc";
import {
  channelsInWorkspace,
  clearTile as clearWorkspaceTile,
  emptyWorkspace,
  focusedChannel,
  focusTile as focusWorkspaceTile,
  type GridLayout,
  moveTile as moveWorkspaceTile,
  openChannel,
  placeChannel as placeWorkspaceChannel,
  removeNamedLayout,
  type SavedLayout,
  safeWorkspace,
  saveNamedLayout,
  setWorkspaceLayout,
  type TileChannel,
  type Workspace,
} from "../core/layout";
import { diffLive, EMPTY_SEEN, type LiveStream, noteLive, type SeenLive } from "../core/live";
import { buildDemo } from "../demo/fixtures";
import { readLaunch } from "../launch";
import {
  chatConnect,
  chatDisconnect,
  chatJoin,
  chatPart,
  chatSend,
  clearSecret,
  emitApp,
  eventsubConnect,
  eventsubDisconnect,
  isTauri,
  loadSecret,
  notify,
  onApp,
  quitApp,
  readLaunchInfo,
  saveSecret,
  setTray,
  writeLog,
} from "../platform/backend";
import { type Favorite, loadPersisted, savePersisted } from "../platform/storage";
import {
  completeLogin,
  createOnlineSubscription,
  deleteSubscription,
  fetchAvatars,
  fetchFollowedLive,
  loadChannelEmotes,
  pollDevice,
  readEventSub,
  refreshStored,
  searchChannels,
  startDevice,
} from "../platform/twitch";
import { openPopout, setOverlayAllowed, showOverlay, toggleOverlay } from "../platform/windows";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

type Phase = "boot" | "setup" | "app";
type View = "watch" | "settings";

type SessionValue = {
  phase: Phase;
  view: View;
  demo: boolean;
  safeMode: boolean;
  logPath: string;
  settings: Settings;
  auth: StoredAuth | null;
  device: DeviceStart | null;
  deviceStatus: string;
  error: string | null;
  missingScopes: string[];
  streams: LiveStream[];
  favorites: Favorite[];
  avatars: Record<string, string>;
  searchQuery: string;
  searchHits: ChannelHit[];
  workspace: Workspace;
  savedLayouts: SavedLayout[];
  messages: Record<string, VisibleChatItem[]>;
  emotes: Map<string, Emote>;
  chatStatus: string;
  setView: (view: View) => void;
  setSearchQuery: (query: string) => void;
  saveClientId: (clientId: string) => void;
  beginLogin: () => Promise<void>;
  cancelLogin: () => void;
  openExternal: (url: string) => Promise<void>;
  openPreview: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  watch: (channel: TileChannel) => void;
  focusTile: (index: number) => void;
  moveTile: (from: number, to: number) => void;
  placeChannel: (index: number, channel: TileChannel) => void;
  clearTile: (index: number) => void;
  setLayout: (layout: GridLayout) => void;
  saveLayout: (name: string) => void;
  restoreLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
  toggleFavorite: (favorite: Favorite) => void;
  sendChat: (text: string) => Promise<void>;
  testNotification: () => Promise<void>;
  openOverlay: () => Promise<void>;
  popout: (channel: string, mini: boolean) => Promise<void>;
  logout: () => Promise<void>;
  quit: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function upsertStream(list: readonly LiveStream[], stream: LiveStream): LiveStream[] {
  if (list.some((item) => item.userId === stream.userId)) return [...list];
  return [stream, ...list];
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const launch = useMemo(() => readLaunch(), []);
  const [phase, setPhase] = useState<Phase>("boot");
  const [view, setView] = useState<View>("watch");
  const [booted, setBooted] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [device, setDevice] = useState<DeviceStart | null>(null);
  const [deviceStatus, setDeviceStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<ChannelHit[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace("duo"));
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [seen, setSeen] = useState<SeenLive>(EMPTY_SEEN);
  const [messages, setMessages] = useState<Record<string, VisibleChatItem[]>>({});
  const [emotes, setEmotes] = useState<Map<string, Emote>>(new Map());
  const [chatStatus, setChatStatus] = useState("offline");
  const [safeMode, setSafeMode] = useState(false);
  const [logPath, setLogPath] = useState("");

  const settingsRef = useRef(settings);
  const authRef = useRef(auth);
  const favoritesRef = useRef(favorites);
  const seenRef = useRef(seen);
  const streamsRef = useRef(streams);
  const workspaceRef = useRef(workspace);
  const joined = useRef(new Set<string>());
  const emoteCache = useRef(new Map<string, Map<string, Emote>>());
  const lastSent = useRef(0);
  const pollStop = useRef<(() => void) | null>(null);
  const polling = useRef(false);
  const subs = useRef({ sessionId: "", key: "", ids: [] as string[] });
  settingsRef.current = settings;
  authRef.current = auth;
  favoritesRef.current = favorites;
  seenRef.current = seen;
  streamsRef.current = streams;
  workspaceRef.current = workspace;

  function updateSettings(patch: Partial<Settings>) {
    setSettings((current) => ({ ...current, ...patch }));
    if (!isTauri() || patch.autostart === undefined || launch.demo) return;
    void (patch.autostart ? enable() : disable()).catch(() => {
      setError("Windows startup could not be changed.");
    });
  }
  const updateRef = useRef(updateSettings);
  updateRef.current = updateSettings;

  const refreshing = useRef(false);

  async function refreshStreams() {
    const current = authRef.current;
    const clientId = settingsRef.current.clientId;
    if (!current || !clientId || launch.demo || refreshing.current) return;
    refreshing.current = true;
    try {
      const live = await fetchFollowedLive(clientId, current);
      const faces = await fetchAvatars(
        clientId,
        current,
        live.map((stream) => stream.userId),
      );
      setAvatars((prev) => ({ ...prev, ...Object.fromEntries(faces) }));
      setStreams(live);
      const favoriteIds = new Set(favoritesRef.current.map((favorite) => favorite.userId));
      const decision = diffLive(seenRef.current, live, settingsRef.current.notify, favoriteIds);
      seenRef.current = decision.next;
      setSeen(decision.next);
      for (const stream of decision.notify) {
        await notify(
          `${stream.displayName} is live`,
          stream.title || stream.gameName || "Just went live on Twitch",
        );
      }
      const favoriteLive = live.filter((stream) => favoriteIds.has(stream.userId));
      const traySource = favoriteLive.length > 0 ? favoriteLive : live;
      await setTray(
        traySource.slice(0, 8).map((stream) => ({
          login: stream.login,
          displayName: stream.displayName,
          viewers: stream.viewers,
        })),
      );
    } finally {
      refreshing.current = false;
    }
  }

  async function subscribeFavorites(sessionId: string) {
    const current = authRef.current;
    const clientId = settingsRef.current.clientId;
    if (!current || !clientId) return;
    const chosen = channelsForEventSub(favoritesRef.current);
    const key = chosen.map((favorite) => favorite.userId).join(",");
    if (subs.current.sessionId === sessionId && subs.current.key === key) return;
    for (const id of subs.current.ids) {
      await deleteSubscription(clientId, current, id).catch(() => undefined);
    }
    const ids: string[] = [];
    for (const favorite of chosen) {
      try {
        const id = await createOnlineSubscription(clientId, current, favorite.userId, sessionId);
        if (id) ids.push(id);
      } catch {
        // Keep going so one rejected favorite does not silence the rest.
      }
    }
    subs.current = { sessionId, key, ids };
  }
  const subscribeRef = useRef(subscribeFavorites);
  subscribeRef.current = subscribeFavorites;
  const actions = useRef({
    refresh: async () => {},
    remember: (_stream: LiveStream) => {},
    sync: async (_workspace: Workspace) => {},
  });
  actions.current.refresh = refreshStreams;
  actions.current.remember = rememberLive;
  actions.current.sync = syncJoins;

  function rememberLive(stream: LiveStream) {
    const decision = noteLive(
      seenRef.current,
      stream,
      settingsRef.current.notify,
      new Set(favoritesRef.current.map((favorite) => favorite.userId)),
    );
    seenRef.current = decision.next;
    setSeen(decision.next);
    setStreams((current) => upsertStream(current, stream));
    if (decision.notify) {
      void notify(
        `${stream.displayName} is live`,
        stream.title || stream.gameName || "Just went live on Twitch",
      );
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (launch.demo) {
        const demo = buildDemo();
        setSettings(demo.settings);
        setAuth(demo.auth);
        setFavorites(demo.favorites);
        setWorkspace(demo.workspace);
        setSavedLayouts(demo.savedLayouts);
        setStreams(demo.streams);
        setMessages(demo.messages);
        setEmotes(demo.emotes);
        setChatStatus("ready");
        setPhase("app");
        setBooted(true);
        return;
      }
      try {
        const persisted = await loadPersisted();
        if (cancelled) return;
        setSettings(persisted.settings);
        settingsRef.current = persisted.settings;
        setFavorites(persisted.favorites);
        favoritesRef.current = persisted.favorites;
        const info = await readLaunchInfo();
        if (cancelled) return;
        setSafeMode(info.safeMode);
        setLogPath(info.logPath);
        const restored = persisted.workspace ?? emptyWorkspace(info.safeMode ? "solo" : "duo");
        setWorkspace(info.safeMode ? safeWorkspace(restored) : restored);
        setSavedLayouts(persisted.savedLayouts);
        setSeen(persisted.seen);
        seenRef.current = persisted.seen;
        await writeLog(
          info.safeMode
            ? "frontend boot in safe mode; overlay stays closed"
            : "frontend boot; overlay not created",
        );
        if (isTauri() && persisted.settings.clientId) {
          await writeLog("reading credential store once");
          const stored = parseStoredAuth((await loadSecret()) ?? "");
          await writeLog(stored ? "credential found" : "no credential stored");
          if (stored) {
            authRef.current = stored;
            setAuth(stored);
            setPhase("app");
          } else {
            setPhase("setup");
            await writeLog("showing setup");
          }
        } else {
          setPhase("setup");
          await writeLog("showing setup; credential store not opened");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Glint couldn't open its settings.");
        setPhase("setup");
      } finally {
        if (!cancelled) setBooted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch.demo]);

  useEffect(() => {
    if (!booted || launch.demo) return;
    const id = window.setTimeout(() => {
      void savePersisted({ settings, favorites, workspace, savedLayouts, seen });
    }, 250);
    return () => window.clearTimeout(id);
  }, [booted, launch.demo, settings, favorites, workspace, savedLayouts, seen]);

  useEffect(() => {
    if (!booted || !isTauri() || launch.demo) return;
    void emitApp("settings-changed", settings);
  }, [booted, launch.demo, settings]);

  useEffect(() => {
    if (phase !== "app" || launch.demo) return;
    let cancelled = false;
    void (async () => {
      const current = authRef.current;
      const clientId = settingsRef.current.clientId;
      if (!current || !clientId) return;
      try {
        const fresh = await refreshStored(clientId, current);
        if (cancelled) return;
        if (
          fresh.accessToken !== current.accessToken ||
          fresh.refreshToken !== current.refreshToken
        ) {
          authRef.current = fresh;
          setAuth(fresh);
          await saveSecret(JSON.stringify(fresh));
        }
        await chatConnect(fresh.login, fresh.accessToken);
        await eventsubConnect();
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : "Couldn't reach Twitch.";
        setError(message);
        if (message.includes("expired") || message.includes("Sign in again")) {
          await clearSecret().catch(() => undefined);
          authRef.current = null;
          setAuth(null);
          setPhase("setup");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, launch.demo]);

  useEffect(() => {
    if (phase !== "app" || launch.demo || launch.mode !== "main") return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      void actions.current.refresh().catch((caught: unknown) => {
        if (!stopped)
          setError(caught instanceof Error ? caught.message : "Couldn't refresh live channels.");
      });
    };
    const start = window.setTimeout(tick, 400);
    const id = window.setInterval(tick, 60_000);
    return () => {
      stopped = true;
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [phase, launch.demo, launch.mode]);

  useEffect(() => {
    if (!isTauri() || launch.demo || launch.mode !== "main") return;
    const unlisten: Array<() => void> = [];
    let cancelled = false;
    void (async () => {
      const fns = await Promise.all([
        onApp<string>("chat-line", (line) => {
          const parsed = parseIrcLine(line);
          if (!parsed) return;
          const event = chatEventFromIrc(parsed, Date.now());
          if (!event?.channel) return;
          setMessages((current) => ({
            ...current,
            [event.channel]: reduceChannel(current[event.channel] ?? [], event),
          }));
        }),
        onApp<string>("chat-status", (status) => {
          setChatStatus(status);
          if (status === "ready") void actions.current.sync(workspaceRef.current);
        }),
        onApp<string>("eventsub-message", (raw) => {
          const frame = readEventSub(raw);
          if (frame.kind === "welcome") void subscribeRef.current(frame.sessionId);
          if (frame.kind !== "notification" || frame.subscriptionType !== "stream.online") return;
          const online = streamOnlineFromEvent(frame.event);
          if (!online) return;
          actions.current.remember({
            streamId: online.startedAt,
            userId: online.userId,
            login: online.login,
            displayName: online.displayName,
            title: "",
            gameName: "",
            viewers: 0,
            startedAt: online.startedAt,
            thumbnail: "",
            language: "",
          });
          void actions.current.refresh().catch(() => undefined);
        }),
        onApp<string>("tray-watch", (login) => {
          const stream = streamsRef.current.find((item) => item.login === login);
          const favorite = favoritesRef.current.find((item) => item.login === login);
          const channel = stream
            ? { login: stream.login, userId: stream.userId, displayName: stream.displayName }
            : favorite;
          if (!channel) return;
          setWorkspace((current) => openChannel(current, channel));
          setView("watch");
        }),
        onApp<null>("tray-overlay", () => {
          void toggleOverlay();
        }),
        onApp<boolean>("overlay-clickthrough", (enabled) => {
          updateRef.current({ clickThrough: enabled });
        }),
      ]);
      if (cancelled) {
        for (const fn of fns) fn();
        return;
      }
      unlisten.push(...fns);
    })();
    return () => {
      cancelled = true;
      for (const fn of unlisten) fn();
    };
  }, [launch.demo, launch.mode]);

  useEffect(() => {
    if (phase !== "app" || launch.demo) return;
    const focused = focusedChannel(workspace);
    if (isTauri()) void emitApp("workspace-focus", focused).catch(() => undefined);
    void actions.current.sync(workspace);
    if (!focused) return;
    const cached = emoteCache.current.get(focused.userId);
    if (cached) {
      setEmotes(cached);
      return;
    }
    let cancelled = false;
    void loadChannelEmotes(focused.userId)
      .then((pack) => {
        emoteCache.current.set(focused.userId, pack);
        if (!cancelled) setEmotes(pack);
      })
      .catch(() => {
        if (!cancelled) setEmotes(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, phase, launch.demo]);

  const favoriteKey = favorites.map((favorite) => favorite.userId).join(",");
  useEffect(() => {
    if (phase !== "app" || launch.demo || !subs.current.sessionId) return;
    if (favoriteKey === subs.current.key && subs.current.ids.length > 0) return;
    void subscribeRef.current(subs.current.sessionId);
  }, [favoriteKey, phase, launch.demo]);

  useEffect(() => {
    if (phase !== "app" || launch.demo) return;
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      const current = authRef.current;
      if (!current) return;
      void searchChannels(settingsRef.current.clientId, current, query)
        .then((hits) => {
          if (!cancelled) setSearchHits(hits);
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "Search failed.");
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [searchQuery, phase, launch.demo]);

  useEffect(() => {
    setOverlayAllowed(phase === "app" && !safeMode && !launch.demo);
  }, [phase, safeMode, launch.demo]);

  useEffect(() => {
    return () => {
      pollStop.current?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri() || launch.mode !== "main" || launch.demo || phase !== "app" || safeMode) return;
    const shortcut = "CommandOrControl+Alt+KeyG";
    let cancelled = false;
    void (async () => {
      await unregister(shortcut).catch(() => undefined);
      if (cancelled || !settings.hotkey) return;
      try {
        await register(shortcut, (event) => {
          if (event.state !== "Pressed") return;
          if (settingsRef.current.clickThrough) {
            updateRef.current({ clickThrough: false });
            void showOverlay();
            return;
          }
          void toggleOverlay();
        });
      } catch {
        setError("Ctrl+Alt+G is already taken by another app.");
      }
    })();
    return () => {
      cancelled = true;
      void unregister(shortcut).catch(() => undefined);
    };
  }, [settings.hotkey, launch.mode, launch.demo, phase, safeMode]);

  async function syncJoins(current: Workspace) {
    if (!isTauri() || launch.demo) return;
    const wanted = new Set(channelsInWorkspace(current).map((channel) => channel.login));
    for (const login of wanted) {
      if (joined.current.has(login)) continue;
      try {
        await chatJoin(login);
        joined.current.add(login);
      } catch {
        // The socket may still be connecting. A later status event retries.
      }
    }
    for (const login of [...joined.current]) {
      if (wanted.has(login)) continue;
      await chatPart(login).catch(() => undefined);
      joined.current.delete(login);
    }
  }

  async function beginLogin() {
    if (!isTauri() || polling.current) return;
    const clientId = settingsRef.current.clientId;
    const problem = validateClientId(clientId);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    polling.current = true;
    const signal = { stop: false };
    pollStop.current = () => {
      signal.stop = true;
    };
    try {
      const start = await startDevice(clientId);
      if (signal.stop) return;
      setDevice(start);
      setDeviceStatus("Approve Glint in the browser. This window checks every few seconds.");
      await writeLog("device-code poll started");
      let interval = nextPollDelay(start.intervalMs, "pending");
      while (!signal.stop && Date.now() < start.expiresAt) {
        await sleep(interval);
        if (signal.stop) return;
        const result = await pollDevice(clientId, start.deviceCode);
        if (result.kind === "pending") {
          interval = nextPollDelay(interval, "pending");
          continue;
        }
        if (result.kind === "slow_down") {
          interval = nextPollDelay(interval, "slow_down");
          setDeviceStatus("Twitch asked Glint to slow down. Still waiting.");
          continue;
        }
        if (result.kind === "success") {
          const stored = await completeLogin(clientId, {
            ...result.token,
            login: "",
            userId: "",
            displayName: "",
            avatar: "",
          });
          await saveSecret(JSON.stringify(stored));
          authRef.current = stored;
          setAuth(stored);
          setDevice(null);
          setDeviceStatus("");
          setPhase("app");
          return;
        }
        setDevice(null);
        setDeviceStatus(
          result.kind === "denied"
            ? "Twitch sign-in was declined."
            : result.kind === "expired" || result.kind === "invalid"
              ? "That code expired. Start again."
              : result.message,
        );
        return;
      }
      if (!signal.stop) {
        setDevice(null);
        setDeviceStatus("That code expired. Start again.");
      }
    } catch (caught) {
      setDevice(null);
      setError(caught instanceof Error ? caught.message : "Twitch sign-in failed.");
    } finally {
      polling.current = false;
      pollStop.current = null;
      await writeLog("device-code poll stopped");
    }
  }

  async function sendChat(text: string) {
    const channel = focusedChannel(workspaceRef.current);
    if (!channel) return;
    if (launch.demo) {
      setMessages((current) => ({
        ...current,
        [channel.login]: reduceChannel(current[channel.login] ?? [], {
          kind: "message",
          id: `local-${Date.now()}`,
          channel: channel.login,
          userId: authRef.current?.userId ?? "1",
          login: authRef.current?.login ?? "preview",
          displayName: authRef.current?.displayName ?? "Preview",
          color: "#ffb088",
          text,
          badges: [],
          emoteTag: "",
          timestamp: Date.now(),
          isAction: false,
        }),
      }));
      return;
    }
    const gate = nextSendAt(lastSent.current, Date.now());
    if (!gate.ok) {
      setError(`Wait ${Math.ceil(gate.waitMs / 1000)}s before sending another message.`);
      return;
    }
    await chatSend(channel.login, text);
    lastSent.current = Date.now();
  }

  const value: SessionValue = {
    phase,
    view,
    demo: launch.demo,
    safeMode,
    logPath,
    settings,
    auth,
    device,
    deviceStatus,
    error,
    missingScopes: auth ? missingScopes(auth.scopes, REQUIRED_SCOPES) : [],
    streams,
    favorites,
    avatars,
    searchQuery,
    searchHits,
    workspace,
    savedLayouts,
    messages,
    emotes,
    chatStatus,
    setView,
    setSearchQuery,
    saveClientId(clientId) {
      const problem = validateClientId(clientId);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      updateSettings({ clientId: clientId.trim() });
    },
    beginLogin,
    cancelLogin() {
      pollStop.current?.();
      pollStop.current = null;
      setDevice(null);
    },
    async openExternal(url) {
      if (isTauri()) await openUrl(url);
      else window.open(url, "_blank", "noopener");
    },
    openPreview() {
      const url = new URL(window.location.href);
      url.searchParams.set("demo", "1");
      window.location.assign(url.toString());
    },
    updateSettings,
    watch(channel) {
      setWorkspace((current) => openChannel(current, channel));
      setView("watch");
    },
    focusTile(index) {
      setWorkspace((current) => focusWorkspaceTile(current, index));
    },
    moveTile(from, to) {
      setWorkspace((current) => moveWorkspaceTile(current, from, to));
    },
    placeChannel(index, channel) {
      setWorkspace((current) => placeWorkspaceChannel(current, index, channel));
    },
    clearTile(index) {
      setWorkspace((current) => clearWorkspaceTile(current, index));
    },
    setLayout(layout) {
      setWorkspace((current) => setWorkspaceLayout(current, layout));
    },
    saveLayout(name) {
      setSavedLayouts((current) => saveNamedLayout(current, name, workspaceRef.current));
    },
    restoreLayout(id) {
      const saved = savedLayouts.find((layout) => layout.id === id);
      if (saved) setWorkspace(saved.workspace);
    },
    deleteLayout(id) {
      setSavedLayouts((current) => removeNamedLayout(current, id));
    },
    toggleFavorite(favorite) {
      setFavorites((current) =>
        current.some((item) => item.userId === favorite.userId)
          ? current.filter((item) => item.userId !== favorite.userId)
          : [...current, favorite],
      );
    },
    sendChat,
    async testNotification() {
      await notify("Glint", "Go-live toasts look like this.");
    },
    openOverlay: showOverlay,
    popout: openPopout,
    async logout() {
      pollStop.current?.();
      if (isTauri()) {
        await chatDisconnect().catch(() => undefined);
        await eventsubDisconnect().catch(() => undefined);
        await clearSecret().catch(() => undefined);
        await setTray([]).catch(() => undefined);
      }
      joined.current.clear();
      subs.current = { sessionId: "", key: "", ids: [] };
      authRef.current = null;
      setAuth(null);
      setStreams([]);
      setMessages({});
      setPhase("setup");
    },
    quit: quitApp,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
