/** Message shapes shared by the Meet content script, service worker, and web handoff. */

/** A caption the content script considers final and no longer editable. */
export type FinalizedLine = {
	/** Speaker name exactly as Meet rendered it, when one was shown. */
	speakerLabel?: string;
	text: string;
	/**
	 * Milliseconds since capture started. Audio will use the same clock.
	 */
	startMs: number;
	endMs: number;
	/** Unique position within the session, used to make uploads idempotent. */
	order: number;
};

export type AuthStatus =
	/** No token has ever been handed over. */
	| "missing"
	/** Token present and, as far as we know, usable. */
	| "connected"
	/** Token present but past its expiry, or rejected by Convex. */
	| "expired";

export type CaptureStatus =
	| "idle"
	| "starting"
	| "recording"
	| "stopping"
	| "error";

/** Everything the in-page overlay needs in order to render itself. */
export type CaptureState = {
	status: CaptureStatus;
	auth: AuthStatus;
	sessionId: string | null;
	/** Lines confirmed stored by Convex. */
	uploaded: number;
	/** Lines captured but not yet acknowledged by Convex. */
	pending: number;
	/** User-facing failure text, if any. */
	error: string | null;
	/** Name of the connected account, for display. */
	account: string | null;
};

export type ContentMessage =
	| { type: "capture:getState" }
	| { type: "capture:start" }
	| { type: "capture:stop" }
	| { type: "capture:lines"; lines: FinalizedLine[] }
	| { type: "capture:connect" };

export type BackgroundMessage = { type: "capture:state"; state: CaptureState };

export type ExternalMessage =
	| {
		type: "verbatim:connect";
		token: string;
		convexUrl: string;
		account?: string | null;
	}
	| { type: "verbatim:ping" };

export type ExternalResponse =
	| { ok: true; extensionVersion: string }
	| { ok: false; error: string };
