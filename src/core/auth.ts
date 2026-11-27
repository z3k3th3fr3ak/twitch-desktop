export const REQUIRED_SCOPES = ["user:read:follows", "chat:read", "chat:edit"] as const;

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};

export type StoredAuth = TokenSet & {
  login: string;
  userId: string;
  displayName: string;
  avatar: string;
};

export type DeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalMs: number;
};

export type DevicePoll =
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "success"; token: TokenSet }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "error"; message: string };

const CLIENT_ID = /^[a-zA-Z0-9]{20,50}$/;

export function validateClientId(value: string): string | null {
  const id = value.trim();
  if (!id) return "Enter the Client ID from your Twitch application.";
  if (!CLIENT_ID.test(id)) {
    return "That Client ID doesn't look right. Copy the 20–50 character Client ID from the Twitch developer console, not the client secret.";
  }
  return null;
}

const MIN_POLL_MS = 5_000;
const MAX_POLL_MS = 30_000;

/** One sleep between device-code polls. Slow-down always waits longer than the last poll. */
export function nextPollDelay(currentMs: number, outcome: "pending" | "slow_down"): number {
  const current = Number.isFinite(currentMs) ? currentMs : MIN_POLL_MS;
  if (outcome === "slow_down") return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, current + 5_000));
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, current));
}

export function formatUserCode(code: string): string {
  const clean = code.replace(/\s+/g, "");
  if (clean.length !== 8) return code.trim();
  return `${clean.slice(0, 4)} ${clean.slice(4)}`;
}

export function deviceStartBody(clientId: string, scopes: readonly string[]): string {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("scopes", scopes.join(" "));
  return params.toString();
}

export function devicePollBody(
  clientId: string,
  scopes: readonly string[],
  deviceCode: string,
): string {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("scopes", scopes.join(" "));
  params.set("device_code", deviceCode);
  params.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code");
  return params.toString();
}

export function refreshBody(clientId: string, refreshToken: string): string {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  return params.toString();
}

export function helixAuthorization(accessToken: string): string {
  return `Bearer ${accessToken.trim()}`;
}

export function validateAuthorization(accessToken: string): string {
  return `OAuth ${accessToken.trim()}`;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseDeviceStart(body: unknown, now: number): DeviceStart {
  const rec = record(body);
  if (!rec) throw new Error("Twitch did not return a device code.");
  const deviceCode = text(rec.device_code);
  const userCode = text(rec.user_code);
  const verificationUri = text(rec.verification_uri);
  const expiresIn = numberValue(rec.expires_in) ?? 0;
  const interval = numberValue(rec.interval) ?? 5;
  if (!deviceCode || !userCode || !verificationUri || expiresIn <= 0) {
    throw new Error("Twitch returned an incomplete device code response.");
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    expiresAt: now + expiresIn * 1000,
    intervalMs: Math.max(interval, 5) * 1000,
  };
}

export function parseTokenSet(body: unknown, now: number, previousRefresh = ""): TokenSet {
  const rec = record(body);
  if (!rec) throw new Error("Twitch did not return a token.");
  const accessToken = text(rec.access_token);
  const refreshToken = text(rec.refresh_token) || previousRefresh;
  const expiresIn = numberValue(rec.expires_in) ?? 60 * 60 * 4;
  const scopes = Array.isArray(rec.scope)
    ? rec.scope.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (!accessToken || !refreshToken) throw new Error("Twitch returned an incomplete token.");
  return {
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    scopes,
  };
}

function oauthErrorCode(body: unknown): string {
  const rec = record(body);
  if (!rec) return "";
  return `${text(rec.error)} ${text(rec.message)}`.trim().toLowerCase();
}

export function interpretDevicePoll(status: number, body: unknown, now: number): DevicePoll {
  const rec = record(body);
  if (status >= 200 && status < 300 && rec && typeof rec.access_token === "string") {
    try {
      return { kind: "success", token: parseTokenSet(body, now) };
    } catch (error) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : "Twitch returned an incomplete token.",
      };
    }
  }
  const code = oauthErrorCode(body);
  if (code.includes("authorization_pending") || code.includes("authorization pending")) {
    return { kind: "pending" };
  }
  if (code.includes("slow_down")) return { kind: "slow_down" };
  if (code.includes("access_denied") || code.includes("access denied")) return { kind: "denied" };
  if (code.includes("expired")) return { kind: "expired" };
  if (
    code.includes("invalid device") ||
    code.includes("invalid_grant") ||
    code.includes("invalid refresh")
  ) {
    return { kind: "invalid" };
  }
  const message =
    (rec && (text(rec.message) || text(rec.error))) || `Twitch returned HTTP ${status}.`;
  return { kind: "error", message };
}

export function tokenNeedsRefresh(expiresAt: number, now: number, skewMs = 60_000): boolean {
  return now >= expiresAt - skewMs;
}

export function missingScopes(granted: readonly string[], required: readonly string[]): string[] {
  const have = new Set(granted);
  return required.filter((scope) => !have.has(scope));
}

export function applyRefresh(previous: StoredAuth, body: unknown, now: number): StoredAuth {
  const next = parseTokenSet(body, now, previous.refreshToken);
  return {
    ...previous,
    ...next,
    scopes: next.scopes.length > 0 ? next.scopes : previous.scopes,
  };
}

export type ValidatedToken = {
  clientId: string;
  login: string;
  userId: string;
  scopes: string[];
  expiresIn: number;
};

export function parseValidate(body: unknown): ValidatedToken {
  const rec = record(body);
  if (!rec) throw new Error("Twitch did not validate the token.");
  const clientId = text(rec.client_id);
  const login = text(rec.login);
  const userId = text(rec.user_id);
  const expiresIn = numberValue(rec.expires_in) ?? 0;
  const scopes = Array.isArray(rec.scopes)
    ? rec.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (!clientId || !login || !userId) throw new Error("Twitch validation response was incomplete.");
  return { clientId, login, userId, scopes, expiresIn };
}

export function assertClientMatch(validated: ValidatedToken, clientId: string): void {
  if (validated.clientId !== clientId) {
    throw new Error("This token was issued to a different Twitch application. Sign in again.");
  }
}

export function parseStoredAuth(raw: string): StoredAuth | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rec = record(parsed);
    if (!rec) return null;
    const accessToken = text(rec.accessToken);
    const refreshToken = text(rec.refreshToken);
    const login = text(rec.login).toLowerCase();
    const userId = text(rec.userId);
    const expiresAt = numberValue(rec.expiresAt) ?? 0;
    if (!accessToken || !refreshToken || !login || !userId || expiresAt <= 0) return null;
    const scopes = Array.isArray(rec.scopes)
      ? rec.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    return {
      accessToken,
      refreshToken,
      expiresAt,
      scopes,
      login,
      userId,
      displayName: text(rec.displayName) || login,
      avatar: text(rec.avatar),
    };
  } catch {
    return null;
  }
}
