declare global {
  interface Window {
    MusicKit?: MusicKitStatic;
  }
}

export interface MusicKitConfigureOptions {
  developerToken: string;
  app: { name: string; build: string };
}

export interface MusicKitQueueDescriptor {
  song?: string;
}

export interface MusicKitEvents {
  playbackStateDidChange: string;
  playbackTimeDidChange: string;
  mediaPlaybackError?: string;
}

export interface MusicKitStatic {
  configure(options: MusicKitConfigureOptions): Promise<MusicKitInstance | undefined>;
  getInstance(): MusicKitInstance | undefined;
  Events: MusicKitEvents;
  PlaybackStates?: Record<string, number>;
}

export interface MusicKitPlaybackController {
  playbackState: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  seekToTime(seconds: number): Promise<void>;
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  player: MusicKitPlaybackController;
  authorize(): Promise<string>;
  setQueue(descriptor: MusicKitQueueDescriptor): Promise<unknown>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  addEventListener(name: string, handler: (event: unknown) => void): void;
}

export {};
