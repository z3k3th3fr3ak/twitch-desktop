import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type HttpResult = { status: number; body: string };

export type TrayEntry = { login: string; displayName: string; viewers: number };

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function httpRequest(request: {
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers?: [string, string][];
  body?: string;
}): Promise<HttpResult> {
  return invoke<HttpResult>("http_request", {
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers ?? [],
      body: request.body ?? null,
    },
  });
}

export async function saveSecret(secret: string): Promise<void> {
  await invoke("credentials_save", { secret });
}

export async function loadSecret(): Promise<string | null> {
  return invoke<string | null>("credentials_load");
}

export async function clearSecret(): Promise<void> {
  await invoke("credentials_clear");
}

export async function chatConnect(login: string, token: string): Promise<void> {
  await invoke("chat_connect", { login, token });
}

export async function chatJoin(channel: string): Promise<void> {
  await invoke("chat_join", { channel });
}

export async function chatPart(channel: string): Promise<void> {
  await invoke("chat_part", { channel });
}

export async function chatSend(channel: string, text: string): Promise<void> {
  await invoke("chat_send", { channel, text });
}

export async function chatDisconnect(): Promise<void> {
  await invoke("chat_disconnect");
}

export async function eventsubConnect(): Promise<void> {
  await invoke("eventsub_connect");
}

export async function eventsubDisconnect(): Promise<void> {
  await invoke("eventsub_disconnect");
}

export async function setTray(channels: TrayEntry[]): Promise<void> {
  await invoke("tray_set_live", { channels });
}

export type LaunchInfo = {
  safeMode: boolean;
  logPath: string;
  minimized: boolean;
};

export async function readLaunchInfo(): Promise<LaunchInfo> {
  if (!isTauri()) return { safeMode: false, logPath: "", minimized: false };
  return invoke<LaunchInfo>("launch_info");
}

export async function writeLog(message: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("append_log", { message });
}

export async function quitApp(): Promise<void> {
  await invoke("app_quit");
}

export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  let allowed = await isPermissionGranted();
  if (!allowed) {
    const permission = await requestPermission();
    allowed = permission === "granted";
  }
  if (allowed) sendNotification({ title, body });
}

export async function emitApp<T>(name: string, payload: T): Promise<void> {
  await emit(name, payload);
}

export function onApp<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (event) => handler(event.payload));
}
