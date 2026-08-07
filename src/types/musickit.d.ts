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
  playbackDurationDidChange: string;
  mediaPlaybackError?: string;
}

export interface MusicKitStatic {
  configure(options: MusicKitConfigureOptions): Promise<MusicKitInstance | undefined>;
  getInstance(): MusicKitInstance | undefined;
  Events: MusicKitEvents;
  PlaybackStates?: Record<string, number>;
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  playbackState: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  authorize(): Promise<string>;
  setQueue(descriptor: MusicKitQueueDescriptor): Promise<unknown>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  addEventListener(name: string, handler: (event: unknown) => void): void;
  removeEventListener(name: string, handler: (event: unknown) => void): void;
}

export {};
