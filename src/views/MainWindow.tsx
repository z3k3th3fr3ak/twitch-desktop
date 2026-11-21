import { ChannelList } from "../components/ChannelList";
import { Chat } from "../components/Chat";
import { Mosaic } from "../components/Mosaic";
import { TitleBar } from "../components/TitleBar";
import { focusedChannel } from "../core/layout";
import { useSession } from "../state/session";
import { Onboarding } from "./Onboarding";
import { SettingsView } from "./SettingsView";

export function MainWindow() {
  const session = useSession();
  const focused = focusedChannel(session.workspace);
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
        />
      ) : null}
      {session.phase === "app" ? (
        <div className={session.view === "settings" ? "workspace settings-mode" : "workspace"}>
          <nav className="rail">
            <button
              type="button"
              className={session.view === "watch" ? "active" : ""}
              onClick={() => session.setView("watch")}
            >
              <span>Watch</span>
            </button>
            <button type="button" onClick={() => void session.openOverlay()}>
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
                  savedLayouts={session.savedLayouts}
                  onFocus={session.focusTile}
                  onMove={session.moveTile}
                  onPlace={session.placeChannel}
                  onClear={session.clearTile}
                  onLayout={session.setLayout}
                  onSave={session.saveLayout}
                  onRestore={session.restoreLayout}
                  onDelete={session.deleteLayout}
                  onPopout={(channel, mini) => void session.popout(channel, mini)}
                />
              </div>
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
            </>
          )}
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
