/** Shared messages for the extension and web handoff. */

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

/** Chrome's permission state for the microphone, on the extension's origin. */
export type MicPermission = "granted" | "prompt" | "denied" | "unknown";

export type AudioStatus =
	| "off"
	/** Tab capture is not granted, so captions can still run. */
	| "unarmed"
	| "recording"
	/** Waiting for upload or retry. */
	| "recorded"
	| "uploading"
	| "saved"
	| "failed";

export type AudioState = {
	status: AudioStatus;
	/** Whether Chrome granted tab capture after an extension invocation. */
	armed: boolean;
	mic: MicPermission;
	/** Whether the mix includes the local microphone. */
	micIncluded: boolean;
	/** Duration of the finished recording. */
	durationMs: number | null;
	/** Delay from the capture clock origin to the first audio sample. */
	offsetMs: number | null;
	error: string | null;
};

export const IDLE_AUDIO: AudioState = {
	status: "off",
	armed: false,
	mic: "unknown",
	micIncluded: false,
	durationMs: null,
	offsetMs: null,
	error: null,
};

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
	/** Epoch timestamp shared by transcript and audio timestamps. */
	captureStartedAtMs: number | null;
	audio: AudioState;
};

export type ContentMessage =
	| { type: "capture:getState" }
	| { type: "capture:start" }
	| { type: "capture:stop" }
	| { type: "capture:lines"; lines: FinalizedLine[] }
	| { type: "capture:connect" }
	/** Opens the page that triggers Chrome's microphone prompt. */
	| { type: "capture:enableMic" };

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

/** Requests for the offscreen recorder. The target prevents cross-context replies. */
export type OffscreenRequest =
	| { target: "offscreen"; type: "audio:permission" }
	| { target: "offscreen"; type: "audio:start"; streamId: string }
	| { target: "offscreen"; type: "audio:stop" }
	| { target: "offscreen"; type: "audio:upload"; uploadUrl: string }
	| { target: "offscreen"; type: "audio:discard" };

export type MicPermissionResult = { mic: MicPermission };

export type AudioStartResult = {
	/** Epoch ms when `MediaRecorder` started. */
	startedAtMs: number;
	micIncluded: boolean;
	mic: MicPermission;
};

export type AudioStopResult = {
	/** Length measured on the recorder's AudioContext clock. */
	durationMs: number;
	/** Wall-clock length of the same span. */
	wallClockMs: number;
	sizeBytes: number;
	mimeType: string;
};

export type AudioUploadResult = { storageId: string };

export type OffscreenResponse<T> =
	| { ok: true; data: T }
	| { ok: false; error: string };
