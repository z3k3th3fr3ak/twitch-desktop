import type { NotifyMode } from "../core/live";
import type { Settings } from "../state/settings";

export function SettingsView({
  settings,
  onChange,
  onTestNotification,
  onLogout,
  onQuit,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onTestNotification: () => void;
  onLogout: () => void;
  onQuit: () => void;
}) {
  return (
    <main className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Go-live alerts</h2>
        <label>
          Notify me
          <select
            value={settings.notify}
            onChange={(event) => onChange({ notify: event.target.value as NotifyMode })}
          >
            <option value="favorites">When a favorite goes live</option>
            <option value="all">When anyone I follow goes live</option>
            <option value="off">Never</option>
          </select>
        </label>
        <button type="button" onClick={onTestNotification}>
          Send a test toast
        </button>
      </section>
      <section>
        <h2>Chat</h2>
        <label>
          Hide messages containing
          <textarea
            value={settings.filterText}
            onChange={(event) => onChange({ filterText: event.target.value })}
            placeholder="One word or phrase per line"
            rows={4}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.mentionHighlight}
            onChange={(event) => onChange({ mentionHighlight: event.target.checked })}
          />
          Highlight messages that mention me
        </label>
        <label>
          Chat size
          <input
            type="range"
            min={12}
            max={22}
            value={settings.chatFontSize}
            onChange={(event) => onChange({ chatFontSize: Number(event.target.value) })}
          />
        </label>
      </section>
      <section>
        <h2>Overlay</h2>
        <label>
          Background strength
          <input
            type="range"
            min={35}
            max={100}
            value={Math.round(settings.overlayOpacity * 100)}
            onChange={(event) => onChange({ overlayOpacity: Number(event.target.value) / 100 })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.clickThrough}
            onChange={(event) => onChange({ clickThrough: event.target.checked })}
          />
          Click through the overlay
        </label>
        <p className="hint">
          Ctrl+Alt+G shows the overlay. If click-through is on, the shortcut turns it off so you can
          reach the controls.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.hotkey}
            onChange={(event) => onChange({ hotkey: event.target.checked })}
          />
          Register the overlay hotkey
        </label>
      </section>
      <section>
        <h2>Windows</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autostart}
            onChange={(event) => onChange({ autostart: event.target.checked })}
          />
          Start Glint with Windows, hidden in the tray
        </label>
        <div className="theme-switch">
          <button
            type="button"
            aria-pressed={settings.theme === "ember"}
            onClick={() => onChange({ theme: "ember" })}
          >
            Ember
          </button>
          <button
            type="button"
            aria-pressed={settings.theme === "dusk"}
            onClick={() => onChange({ theme: "dusk" })}
          >
            Dusk
          </button>
        </div>
      </section>
      <section className="danger-zone">
        <button type="button" onClick={onLogout}>
          Sign out
        </button>
        <button type="button" className="ghost" onClick={onQuit}>
          Quit Glint
        </button>
      </section>
    </main>
  );
}
