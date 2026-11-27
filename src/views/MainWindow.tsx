import { ChannelList } from "../components/ChannelList";
import { Chat } from "../components/Chat";
import { Mosaic } from "../components/Mosaic";
import { PlayerLayer } from "../components/PlayerLayer";
import { TitleBar } from "../components/TitleBar";
import { focusedChannel } from "../core/layout";
import { planPlayback } from "../core/playback";
import { useSession } from "../state/session";
import { Onboarding } from "./Onboarding";
import { SettingsView } from "./SettingsView";

export function MainWindow() {
  const session = useSession();
  const focused = focusedChannel(session.workspace);
  const plan =
    session.phase === "app"
      ? planPlayback({
          grid: session.workspace.tiles.flatMap((tile) => (tile ? [tile.login] : [])),
          focused: focused?.login ?? null,
          mini: session.miniLogin,
          view: session.view,
          audioFollow: session.settings.audioFollow,
          audioSurface: session.audioSurface,
          armed: session.liveLogins,
          holdPlayback: true,
        })
      : [];
  const audibleLogin = plan.find((player) => player.audible)?.login ?? null;
  const quadChats = session.view === "watch" && session.workspace.layout === "quad";
  const subtitle = focused
    ? `Listening to ${focused.displayName}`
    : session.phase === "app"
      ? "Multi-view"
      : "Setup";
  return (
    <div className="app">
      <TitleBar subtitle={subtitle} />
      {session.phase === "boot" ? <p className="boot">Opening Glint…</p> : null}
      {session.phase === "setup" ? (
        <Onboarding
          clientId={session.settings.clientId}
          device={session.device}
          deviceStatus={session.deviceStatus}
          error={session.error}
          onSaveClientId={session.saveClientId}
          onBeginLogin={() => void session.beginLogin()}
          onCancelLogin={session.cancelLogin}
          onOpenVerify={(url) => void session.openExternal(url)}
          safeMode={session.safeMode}
          logPath={session.logPath}
        />
      ) : null}
      {session.phase === "app" ? (
        <div
          className={
            session.view === "settings"
              ? "workspace settings-mode"
              : quadChats
                ? "workspace quad-chats"
                : "workspace"
          }
        >
          <nav className="rail">
            <button
              type="button"
              className={session.view === "watch" ? "active" : ""}
              onClick={() => session.setView("watch")}
            >
              <span>Watch</span>
            </button>
            <button
              type="button"
              disabled={session.safeMode}
              onClick={() => void session.openOverlay()}
            >
              <span>Overlay</span>
            </button>
            <button
              type="button"
              className={session.view === "settings" ? "active" : ""}
              onClick={() => session.setView("settings")}
            >
              <span>Settings</span>
            </button>
          </nav>
          {session.view === "settings" ? (
            <SettingsView
              settings={session.settings}
              onChange={session.updateSettings}
              onTestNotification={() => void session.testNotification()}
              onLogout={() => void session.logout()}
              onQuit={() => void session.quit()}
            />
          ) : (
            <>
              <ChannelList
                streams={session.streams}
                favorites={session.favorites}
                query={session.searchQuery}
                hits={session.searchHits}
                avatars={session.avatars}
                activeLogin={focused?.login ?? null}
                onQuery={session.setSearchQuery}
                onOpen={session.watch}
                onToggleFavorite={session.toggleFavorite}
              />
              <div className="stage-wrap">
                {session.error ? <p className="banner">{session.error}</p> : null}
                {session.missingScopes.length > 0 ? (
                  <p className="banner">
                    Twitch did not grant {session.missingScopes.join(", ")}. Sign in again and
                    accept every requested permission.
                  </p>
                ) : null}
                <Mosaic
                  workspace={session.workspace}
                  demo={session.demo}
                  liveLogins={session.liveLogins}
                  audibleLogin={audibleLogin}
                  savedLayouts={session.savedLayouts}
                  onFocus={session.focusTile}
                  onMove={session.moveTile}
                  onPlace={session.placeChannel}
                  onClear={session.clearTile}
                  onLayout={session.setLayout}
                  onSave={session.saveLayout}
                  onRestore={session.restoreLayout}
                  onDelete={session.deleteLayout}
                  onPopout={(channel) => void session.popout(channel)}
                  onDockMini={session.dockMini}
                  onTileChat={session.setTileChat}
                  onAllChats={session.setAllChats}
                  messages={session.messages}
                  emotePacks={session.emotePacks}
                  selfLogin={session.auth?.login ?? ""}
                  chatStatus={session.chatStatus}
                  filterText={session.settings.filterText}
                  highlightMentions={session.settings.mentionHighlight}
                  chatFontSize={session.settings.chatFontSize}
                  onSendChat={(login, text) => void session.sendChat(text, login)}
                />
              </div>
              {quadChats ? null : (
                <Chat
                  channel={focused?.login ?? null}
                  items={focused ? (session.messages[focused.login] ?? []) : []}
                  emotes={session.emotes}
                  selfLogin={session.auth?.login ?? ""}
                  status={session.chatStatus}
                  filterText={session.settings.filterText}
                  highlight={session.settings.mentionHighlight}
                  fontSize={session.settings.chatFontSize}
                  onSend={session.sendChat}
                />
              )}
            </>
          )}
          <PlayerLayer
            plan={plan}
            demo={session.demo}
            names={session.channelNames}
            watchLayout={session.view === "watch"}
            sideChat={session.view === "watch" && !quadChats}
            measureKey={`${session.workspace.layout}:${session.workspace.chats.join("")}`}
            audioFollow={session.settings.audioFollow}
            pinned={session.settings.miniAlwaysOnTop}
            onTogglePin={() =>
              session.updateSettings({ miniAlwaysOnTop: !session.settings.miniAlwaysOnTop })
            }
            onCloseMini={session.closeMini}
            onListenMini={() => session.focusAudio("mini")}
            onActivate={(login) => {
              const index = session.workspace.tiles.findIndex((tile) => tile?.login === login);
              if (index >= 0) session.focusTile(index);
            }}
          />
        </div>
      ) : null}
      {session.phase === "setup" && !session.demo ? (
        <button type="button" className="preview-link" onClick={() => session.openPreview()}>
          Preview the multi-view layout
        </button>
      ) : null}
    </div>
  );
}
