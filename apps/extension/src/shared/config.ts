/** Build-time Convex URL used until the web handoff supplies one. */
export const DEFAULT_CONVEX_URL: string = import.meta.env.WXT_CONVEX_URL ?? "";

/** Site origin for the extension's token handoff. */
export const CONNECT_ORIGIN: string =
	import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";

export const CONNECT_URL = `${CONNECT_ORIGIN}/extension/connect`;

export const FLUSH_INTERVAL_MS = 4000;

export const MAX_BATCH = 50;

export const OFFSCREEN_URL = "/offscreen.html";

export const MIC_PERMISSION_URL = "/mic-permission.html";

/**
 * WebM/Opus. The container header omits duration, so it is stored separately.
 */
export const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";

export const AUDIO_BITS_PER_SECOND = 32_000;

/** Bounds how much buffered audio a crash can lose. */
export const AUDIO_TIMESLICE_MS = 5_000;
