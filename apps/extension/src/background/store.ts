import { browser } from "wxt/browser";
import { IDLE_AUDIO, type AudioState, type FinalizedLine } from "../shared/protocol";

/** Keeps buffered capture state available when an MV3 worker restarts. */

const STORAGE_KEY = "verbatim.capture";

export type CaptureRecord = {
	status: "idle" | "starting" | "recording" | "stopping" | "error";
	sessionId: string | null;
	/** Number of lines Convex has acknowledged. */
	uploaded: number;
	/** Captured lines that Convex has not acknowledged, in capture order. */
	buffer: FinalizedLine[];
	/** Next line order, persisted so a page reload cannot restart numbering. */
	nextOrder: number;
	error: string | null;
	/** Epoch timestamp shared by transcript and audio. */
	captureStartedAtMs: number | null;
	/** Meet tab captured for this lesson. */
	tabId: number | null;
	audio: AudioState;
};

export const EMPTY_RECORD: CaptureRecord = {
	status: "idle",
	sessionId: null,
	uploaded: 0,
	buffer: [],
	nextOrder: 0,
	error: null,
	captureStartedAtMs: null,
	tabId: null,
	audio: IDLE_AUDIO,
};

export async function loadRecord(): Promise<CaptureRecord> {
	const stored = await browser.storage.session.get(STORAGE_KEY);
	return (stored[STORAGE_KEY] as CaptureRecord | undefined) ?? EMPTY_RECORD;
}

export async function saveRecord(record: CaptureRecord): Promise<void> {
	await browser.storage.session.set({ [STORAGE_KEY]: record });
}
