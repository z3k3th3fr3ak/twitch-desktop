import { useState } from "react";
import { type DeviceStart, formatUserCode, REQUIRED_SCOPES, validateClientId } from "../core/auth";
import { isTauri } from "../platform/backend";

export function Onboarding({
  clientId,
  device,
  deviceStatus,
  error,
  onSaveClientId,
  onBeginLogin,
  onCancelLogin,
  onOpenVerify,
  safeMode,
  logPath,
}: {
  clientId: string;
  device: DeviceStart | null;
  deviceStatus: string;
  error: string | null;
  onSaveClientId: (clientId: string) => void;
  onBeginLogin: () => void;
  onCancelLogin: () => void;
  onOpenVerify: (url: string) => void;
  safeMode: boolean;
  logPath: string;
}) {
  const [draft, setDraft] = useState(clientId);
  const problem = validateClientId(draft);
  return (
    <main className="onboard">
      <p className="eyebrow">Public Twitch app · device code</p>
      <h1>Bring your own Twitch application.</h1>
      <p className="lede">
        Glint never ships a client secret. You register a Public app at dev.twitch.tv, paste its
        Client ID here, and approve it with a device code. Tokens stay in Windows Credential
        Manager.
      </p>
      {safeMode ? (
        <p className="banner">
          Safe mode is on. The overlay stays closed, and video will not play until you click a tile.
        </p>
      ) : null}
      {error ? <p className="banner">{error}</p> : null}
      <ol className="steps">
        <li>
          <h2>Register the app</h2>
          <p>
            Open the{" "}
            <button
              type="button"
              className="link"
              onClick={() => onOpenVerify("https://dev.twitch.tv/console/apps")}
            >
              Twitch developer console
            </button>
            , choose Register Your Application, and use:
          </p>
          <ul>
            <li>Name: Glint</li>
            <li>OAuth Redirect URL: http://localhost:3000</li>
            <li>Category: Application Integration</li>
            <li>Client type: Public</li>
          </ul>
          <p>
            Device code does not open that redirect. Twitch still requires one. Do not create a
            confidential client, and do not paste a client secret anywhere.
          </p>
        </li>
        <li>
          <h2>Paste the Client ID</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!problem) onSaveClientId(draft.trim());
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Client ID"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Twitch Client ID"
            />
            <button type="submit" disabled={Boolean(problem)}>
              Save client ID
            </button>
          </form>
          {draft.trim() && problem ? <p className="hint">{problem}</p> : null}
        </li>
        <li>
          <h2>Approve on Twitch</h2>
          <p>Glint will ask for {REQUIRED_SCOPES.join(", ")}.</p>
          {device ? (
            <div className="device-code">
              <strong>{formatUserCode(device.userCode)}</strong>
              <p>{deviceStatus || "Approve the code in your browser."}</p>
              <div className="row">
                <button type="button" onClick={() => onOpenVerify(device.verificationUri)}>
                  Open Twitch to authorize
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void navigator.clipboard.writeText(device.userCode)}
                >
                  Copy code
                </button>
                <button type="button" className="ghost" onClick={onCancelLogin}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={!clientId || !isTauri()} onClick={onBeginLogin}>
              Sign in with Twitch
            </button>
          )}
          {!isTauri() ? (
            <p className="hint">
              Sign-in runs inside the Glint desktop app. This browser view is only a preview.
            </p>
          ) : null}
          {deviceStatus && !device ? <p className="hint">{deviceStatus}</p> : null}
        </li>
      </ol>
      {logPath ? (
        <p className="hint">
          Startup log: <code>{logPath}</code>
        </p>
      ) : null}
    </main>
  );
}
