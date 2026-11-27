import { describe, expect, it } from "vitest";
import {
  applyRefresh,
  assertClientMatch,
  devicePollBody,
  deviceStartBody,
  formatUserCode,
  helixAuthorization,
  interpretDevicePoll,
  missingScopes,
  nextPollDelay,
  parseDeviceStart,
  parseStoredAuth,
  parseTokenSet,
  parseValidate,
  REQUIRED_SCOPES,
  refreshBody,
  tokenNeedsRefresh,
  validateAuthorization,
  validateClientId,
} from "./auth";

const NOW = 1_700_000_000_000;

describe("client id", () => {
  it("rejects blank, short, and secret-looking values", () => {
    expect(validateClientId("  ")).toMatch(/Enter the Client ID/);
    expect(validateClientId("short")).toMatch(/doesn't look right/);
    expect(validateClientId("has spaces in the identifier!!")).toMatch(/doesn't look right/);
  });

  it("accepts a normal public client id", () => {
    expect(validateClientId(" abcdefghij1234567890 ")).toBeNull();
  });
});

describe("device code flow", () => {
  it("parses the official start response", () => {
    const start = parseDeviceStart(
      {
        device_code: "ike3GM8QIdYZs43KdrWPIO36LofILoCyFEzjlQ91",
        expires_in: 1800,
        interval: 5,
        user_code: "ABCDEFGH",
        verification_uri: "https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH",
      },
      NOW,
    );
    expect(start.userCode).toBe("ABCDEFGH");
    expect(start.expiresAt).toBe(NOW + 1_800_000);
    expect(start.intervalMs).toBe(5_000);
    expect(formatUserCode(start.userCode)).toBe("ABCD EFGH");
  });

  it("does not poll faster than five seconds", () => {
    const start = parseDeviceStart(
      {
        device_code: "device",
        expires_in: 30,
        interval: 1,
        user_code: "ABCD",
        verification_uri: "https://www.twitch.tv/activate",
      },
      NOW,
    );
    expect(start.intervalMs).toBe(5_000);
    expect(formatUserCode("ABCD")).toBe("ABCD");
  });

  it("builds the device and refresh form bodies without a client secret", () => {
    const start = new URLSearchParams(deviceStartBody("client", REQUIRED_SCOPES));
    expect(start.get("client_id")).toBe("client");
    expect(start.get("scopes")).toBe("user:read:follows chat:read chat:edit");
    expect(start.get("client_secret")).toBeNull();

    const poll = new URLSearchParams(devicePollBody("client", REQUIRED_SCOPES, "device"));
    expect(poll.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(poll.get("device_code")).toBe("device");

    const refresh = new URLSearchParams(refreshBody("client", "refresh-1"));
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("refresh-1");
    expect(refresh.get("client_secret")).toBeNull();
  });

  it("keeps waiting while authorization is pending", () => {
    expect(
      interpretDevicePoll(400, { status: 400, message: "authorization_pending" }, NOW).kind,
    ).toBe("pending");
    expect(interpretDevicePoll(400, { error: "slow_down", message: "slow down" }, NOW).kind).toBe(
      "slow_down",
    );
  });

  it("maps denied, expired, and invalid device codes", () => {
    expect(interpretDevicePoll(400, { message: "access_denied" }, NOW).kind).toBe("denied");
    expect(interpretDevicePoll(400, { error: "expired_token" }, NOW).kind).toBe("expired");
    expect(
      interpretDevicePoll(400, { status: 400, message: "invalid device code" }, NOW).kind,
    ).toBe("invalid");
  });

  it("accepts a successful token response and rejects a partial one", () => {
    const result = interpretDevicePoll(
      200,
      {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 14400,
        scope: ["chat:read", "user:read:follows"],
        token_type: "bearer",
      },
      NOW,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.token.expiresAt).toBe(NOW + 14_400_000);
      expect(result.token.scopes).toEqual(["chat:read", "user:read:follows"]);
    }

    const broken = interpretDevicePoll(200, { access_token: "only-access" }, NOW);
    expect(broken.kind).toBe("error");
  });
});

describe("refresh and validation", () => {
  const stored = {
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: NOW,
    scopes: ["chat:read"],
    login: "zeke",
    userId: "9",
    displayName: "Zeke",
    avatar: "",
  };

  it("rotates the one-time refresh token", () => {
    const next = applyRefresh(
      stored,
      { access_token: "new-access", refresh_token: "new-refresh", expires_in: 100, scope: [] },
      NOW,
    );
    expect(next.accessToken).toBe("new-access");
    expect(next.refreshToken).toBe("new-refresh");
    expect(next.scopes).toEqual(["chat:read"]);
    expect(next.login).toBe("zeke");
  });

  it("keeps the previous refresh token if Twitch omits the rotated one", () => {
    const token = parseTokenSet({ access_token: "new-access", expires_in: 10 }, NOW, "kept");
    expect(token.refreshToken).toBe("kept");
  });

  it("refreshes a minute before expiry", () => {
    expect(tokenNeedsRefresh(NOW + 30_000, NOW)).toBe(true);
    expect(tokenNeedsRefresh(NOW + 120_000, NOW)).toBe(false);
  });

  it("checks the token belongs to this client and reports missing scopes", () => {
    const validated = parseValidate({
      client_id: "client",
      login: "zeke",
      user_id: "9",
      expires_in: 1000,
      scopes: ["chat:read"],
    });
    expect(validated.userId).toBe("9");
    expect(() => assertClientMatch(validated, "other")).toThrow(/different Twitch application/);
    expect(missingScopes(validated.scopes, REQUIRED_SCOPES)).toEqual([
      "user:read:follows",
      "chat:edit",
    ]);
  });

  it("formats the two different authorization headers Twitch expects", () => {
    expect(helixAuthorization("abc")).toBe("Bearer abc");
    expect(validateAuthorization("abc")).toBe("OAuth abc");
  });
});

describe("device poll pacing", () => {
  it("never polls faster than five seconds and slows down further when asked", () => {
    expect(nextPollDelay(0, "pending")).toBe(5_000);
    expect(nextPollDelay(5_000, "pending")).toBe(5_000);
    expect(nextPollDelay(5_000, "slow_down")).toBe(10_000);
    expect(nextPollDelay(28_000, "slow_down")).toBe(30_000);
  });
});

describe("stored auth", () => {
  it("accepts a credential payload and rejects anything incomplete", () => {
    expect(parseStoredAuth("not-json")).toBeNull();
    expect(parseStoredAuth(JSON.stringify({ accessToken: "a" }))).toBeNull();
    expect(
      parseStoredAuth(
        JSON.stringify({
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: 10,
          login: "Zeke",
          userId: "9",
          displayName: "Zeke",
          scopes: ["chat:read"],
        }),
      ),
    ).toMatchObject({ login: "zeke", userId: "9", scopes: ["chat:read"] });
  });
});
