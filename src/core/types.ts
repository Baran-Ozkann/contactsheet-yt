export type PlaylistId = string;
export type VideoId = string;

/** YouTube video ids are exactly 11 url-safe base64 characters. */
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** "WL", "LL" and "PL..." style ids. Deliberately loose but bounded. */
export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

export function isVideoId(value: unknown): value is VideoId {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

export function isPlaylistId(value: unknown): value is PlaylistId {
  return typeof value === 'string' && PLAYLIST_ID_RE.test(value);
}

export interface PlaylistSetting {
  title: string;
  hidden: boolean;
  itemCount: number | null;
  lastSyncedAt: number | null;
}

export interface Settings {
  schemaVersion: 1;
  enabled: boolean;
  debugOverlay: boolean;
  syncIntervalMinutes: number;
  playlists: Record<PlaylistId, PlaylistSetting>;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  enabled: true,
  debugOverlay: false,
  syncIntervalMinutes: 360,
  playlists: {},
};

export const MIN_SYNC_INTERVAL_MINUTES = 30;

export interface IndexEntry {
  playlistId: PlaylistId;
  videoIds: VideoId[];
  syncedAt: number;
  /** False when the continuation chain was cut short by an error or a cap. */
  complete: boolean;
}
