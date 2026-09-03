/** Build-time Convex URL used until the web handoff supplies one. */
export const DEFAULT_CONVEX_URL: string = import.meta.env.WXT_CONVEX_URL ?? "";

/** Site origin for the extension's token handoff. */
export const CONNECT_ORIGIN: string =
	import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000";

export const CONNECT_URL = `${CONNECT_ORIGIN}/extension/connect`;

export const FLUSH_INTERVAL_MS = 4000;

export const MAX_BATCH = 50;
