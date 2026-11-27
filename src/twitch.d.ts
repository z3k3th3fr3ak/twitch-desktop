export type TwitchPlaybackStats = {
  hlsLatencyBroadcaster?: number;
  bufferSize?: number;
};

export type TwitchPlayerInstance = {
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  play: () => void;
  pause: () => void;
  setQuality: (quality: string) => void;
  getQualities: () => string[];
  getQuality: () => string;
  getPlaybackStats: () => TwitchPlaybackStats;
  addEventListener: (event: string, callback: () => void) => void;
  setChannel: (channel: string) => void;
};

export type TwitchPlayerOptions = {
  width: string | number;
  height: string | number;
  channel?: string;
  video?: string;
  parent?: string[];
  autoplay?: boolean;
  muted?: boolean;
};

declare global {
  interface Window {
    Twitch?: {
      Player: {
        new (elementId: string, options: TwitchPlayerOptions): TwitchPlayerInstance;
        READY: string;
      };
    };
  }
}
