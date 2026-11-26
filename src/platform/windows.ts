import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./backend";

let overlayAllowed = false;

/** The transparent overlay is created only after sign-in, and never in safe mode. */
export function setOverlayAllowed(allowed: boolean) {
  overlayAllowed = allowed;
}

export async function openPopout(channel: string, mini: boolean): Promise<void> {
  if (!isTauri()) return;
  const label = `popout-${channel}`.replace(/[^a-zA-Z0-9\-/:_]/g, "").slice(0, 48);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.unminimize();
    await existing.setAlwaysOnTop(mini);
    await existing.setFocus();
    return;
  }
  new WebviewWindow(label, {
    url: `index.html?window=popout&channel=${encodeURIComponent(channel)}${mini ? "&mini=1" : ""}`,
    title: `${channel} · Glint`,
    width: mini ? 640 : 980,
    height: mini ? 400 : 600,
    minWidth: 400,
    minHeight: 300,
    alwaysOnTop: mini,
    decorations: true,
    resizable: true,
    center: false,
    useHttpsScheme: true,
  });
}

export async function showOverlay(): Promise<void> {
  if (!isTauri() || !overlayAllowed) return;
  const existing = await WebviewWindow.getByLabel("overlay");
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  createOverlay();
}

export async function toggleOverlay(): Promise<void> {
  if (!isTauri() || !overlayAllowed) return;
  const existing = await WebviewWindow.getByLabel("overlay");
  if (existing) {
    if (await existing.isVisible()) await existing.hide();
    else {
      await existing.show();
      await existing.setFocus();
    }
    return;
  }
  createOverlay();
}

function createOverlay(): void {
  new WebviewWindow("overlay", {
    url: "index.html?window=overlay",
    title: "Glint overlay",
    width: 380,
    height: 640,
    minWidth: 280,
    minHeight: 320,
    transparent: true,
    alwaysOnTop: true,
    decorations: false,
    shadow: false,
    skipTaskbar: true,
    resizable: true,
    focus: true,
    useHttpsScheme: true,
  });
}

export async function closeOverlay(): Promise<void> {
  if (!isTauri()) return;
  const existing = await WebviewWindow.getByLabel("overlay");
  if (existing) await existing.hide();
}

export async function setClickThrough(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().setIgnoreCursorEvents(enabled);
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().minimize();
}

export async function toggleMaximize(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().close();
}
