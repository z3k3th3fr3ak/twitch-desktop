import { closeWindow, minimizeWindow, toggleMaximize } from "../platform/windows";

export function TitleBar({ subtitle }: { subtitle: string }) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        Glint
      </div>
      <p data-tauri-drag-region>{subtitle}</p>
      <div className="window-controls">
        <button type="button" aria-label="Minimize" onClick={() => void minimizeWindow()}>
          –
        </button>
        <button type="button" aria-label="Maximize" onClick={() => void toggleMaximize()}>
          □
        </button>
        <button
          type="button"
          className="close"
          aria-label="Hide to tray"
          onClick={() => void closeWindow()}
        >
          ×
        </button>
      </div>
    </header>
  );
}
