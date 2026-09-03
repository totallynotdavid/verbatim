import { api } from "@verbatim/backend/convex/_generated/api";
import type { Id } from "@verbatim/backend/convex/_generated/dataModel";
import { ConvexHttpClient } from "convex/browser";
import { browser } from "wxt/browser";
import { CONNECT_URL, FLUSH_INTERVAL_MS, MAX_BATCH } from "../shared/config";
import type {
	CaptureState,
	ContentMessage,
	ExternalMessage,
	ExternalResponse,
	FinalizedLine,
} from "../shared/protocol";
import { IDLE_AUDIO } from "../shared/protocol";
import * as audio from "./audio";
import {
	authStatus,
	expireAuth,
	isAuthFailure,
	loadAuth,
	saveAuth,
	type StoredAuth,
} from "./auth";
import { type CaptureRecord, loadRecord, saveRecord } from "./store";

/** Wakes a stopped worker so buffered lines still flush during a lull. */
const FLUSH_ALARM = "verbatim.flush";

let flushTimer: ReturnType<typeof setInterval> | null = null;
/** Serializes flushes so stopping waits for all earlier uploads. */
let flushQueue: Promise<void> = Promise.resolve();

function createConvexClient(auth: StoredAuth): ConvexHttpClient {
	if (auth.convexUrl === "") {
		throw new Error(
			"No Convex deployment URL. Reconnect from the website, or rebuild the extension after running `convex dev`.",
		);
	}
	const convex = new ConvexHttpClient(auth.convexUrl);
	convex.setAuth(auth.token);
	return convex;
}

async function toState(
	record: CaptureRecord,
	tabId: number | null = null,
): Promise<CaptureState> {
	const auth = await loadAuth();
	return {
		status: record.status,
		auth: authStatus(auth, Date.now()),
		sessionId: record.sessionId,
		uploaded: record.uploaded,
		pending: record.buffer.length,
		error: record.error,
		account: auth?.account ?? null,
		captureStartedAtMs: record.captureStartedAtMs,
		audio: {
			...record.audio,
			// Arming is tab-scoped, so read it for the target tab.
			armed: await audio.isArmed(record.tabId ?? tabId),
		},
	};
}

async function broadcast(record: CaptureRecord): Promise<void> {
	const tabs = await browser.tabs.query({ url: "https://meet.google.com/*" });
	for (const tab of tabs) {
		if (tab.id === undefined) continue;
		const state = await toState(record, tab.id);
		browser.tabs.sendMessage(tab.id, { type: "capture:state", state }, () => {
			// Ignore tabs without the content script.
			void browser.runtime.lastError;
		});
	}
	await updateRecordingBadge(record.status);
}

/** Reflects capture status in the toolbar. */
async function updateRecordingBadge(status: CaptureState["status"]): Promise<void> {
	try {
		const recording = status === "recording";
		await browser.action.setBadgeText({ text: recording ? "REC" : "" });
		if (recording) {
			await browser.action.setBadgeBackgroundColor({ color: "#b91c1c" });
		}
	} catch {
		// Badge updates are best effort.
	}
}

/** Applies a change to the latest stored record. */
async function patchRecord(
	change: (record: CaptureRecord) => CaptureRecord,
): Promise<CaptureRecord> {
	const next = change(await loadRecord());
	await saveRecord(next);
	return next;
}

function startFlushLoop(): void {
	if (flushTimer === null) {
		flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
	}
		// The interval uploads while the worker is alive. The alarm revives it after
		// suspension.
	void browser.alarms.create(FLUSH_ALARM, { periodInMinutes: 0.5 });
}

function stopFlushLoop(): void {
	if (flushTimer !== null) {
		clearInterval(flushTimer);
		flushTimer = null;
	}
	void browser.alarms.clear(FLUSH_ALARM);
}

/** Queues a flush so callers can await earlier uploads. */
function flush(): Promise<void> {
	flushQueue = flushQueue.then(drain, drain);
	return flushQueue;
}

/** Keeps buffered lines until Convex acknowledges them so failures can retry. */
async function drain(): Promise<void> {
	for (;;) {
		const record = await loadRecord();
		if (record.sessionId === null || record.buffer.length === 0) return;

		const auth = await loadAuth();
		if (auth === null || authStatus(auth, Date.now()) !== "connected") {
			await broadcast(record);
			return;
		}

		const batch = record.buffer.slice(0, MAX_BATCH);
		try {
			await createConvexClient(auth).mutation(api.transcriptLines.append, {
				sessionId: record.sessionId as Id<"lessonSessions">,
				lines: batch,
			});
		} catch (error) {
			const authFailure = isAuthFailure(error);
			if (authFailure) {
				await expireAuth();
			}
			const next: CaptureRecord = {
				...record,
				error: authFailure
					? null // The overlay already explains an expired sign-in.
					: `Upload failed, will retry: ${errorMessage(error)}`,
			};
			await saveRecord(next);
			await broadcast(next);
			return;
		}

		const latest = await loadRecord();
		const next: CaptureRecord = {
			...latest,
			buffer: latest.buffer.slice(batch.length),
			uploaded: latest.uploaded + batch.length,
			error: null,
		};
		await saveRecord(next);
		await broadcast(next);
	}
}

/** Extracts the mutation message from Convex's request-wrapped error. */
function errorMessage(error: unknown): string {
	const text = error instanceof Error ? error.message : String(error);
	const thrown = /^Uncaught \w*Error:\s*(.+)$/m.exec(text)?.[1];
	return (thrown ?? text.split("\n")[0] ?? text).trim().slice(0, 200);
}

async function startLesson(tabId: number | null): Promise<CaptureRecord> {
	const current = await loadRecord();
	if (current.status === "recording" || current.status === "starting") {
		return current;
	}

	const auth = await loadAuth();
	if (auth === null || authStatus(auth, Date.now()) !== "connected") {
		const next: CaptureRecord = {
			...current,
			status: "idle",
			error: null,
		};
		await saveRecord(next);
		return next;
	}

	await saveRecord({ ...current, status: "starting", error: null });
	await broadcast({ ...current, status: "starting", error: null });

	try {
		const sessionId = await createConvexClient(auth).mutation(
			api.lessonSessions.startSession,
			{},
		);
		// Use one clock origin for captions and audio.
		const captureStartedAtMs = Date.now();
		const next: CaptureRecord = {
			status: "recording",
			sessionId,
			uploaded: 0,
			buffer: [],
			nextOrder: 0,
			error: null,
			captureStartedAtMs,
			tabId,
			audio: { ...IDLE_AUDIO, status: "unarmed" },
		};
		await saveRecord(next);
		startFlushLoop();
		// Start audio in parallel. Startup delay is stored as its offset.
		void beginAudio().then(async () => broadcast(await loadRecord()));
		return next;
	} catch (error) {
		const authFailure = isAuthFailure(error);
		if (authFailure) {
			await expireAuth();
		}
		const next: CaptureRecord = {
			...current,
			status: "error",
			error: errorMessage(error),
		};
		await saveRecord(next);
		return next;
	}
}

/** Starts audio when the lesson's tab has a capture grant. */
async function beginAudio(): Promise<void> {
	const record = await loadRecord();
	if (record.status !== "recording" || record.tabId === null) return;
	if (record.audio.status === "recording") return;

	// Permission lookup may create the offscreen document, so close it when the
	// tab is not armed.
	const mic = await audio.readMicPermission();
	if (!(await audio.isArmed(record.tabId))) {
		await audio.closeOffscreen();
		await patchRecord((r) => ({
			...r,
			audio: { ...r.audio, status: "unarmed", armed: false, mic, error: null },
		}));
		return;
	}

	try {
		const streamId = await audio.getStreamId(record.tabId);
		const started = await audio.startAudio(streamId);
		// Do not leave a recorder running after a concurrent stop.
		const settled = await loadRecord();
		if (settled.sessionId !== record.sessionId || settled.status !== "recording") {
			try {
				await audio.stopAudio();
				await audio.discardAudio();
			} finally {
				await audio.closeOffscreen();
			}
			return;
		}
		await patchRecord((r) => ({
			...r,
			audio: {
				status: "recording",
				armed: true,
				mic: started.mic,
				micIncluded: started.micIncluded,
				durationMs: null,
				// Audio starts after the shared caption clock.
				offsetMs: started.startedAtMs - (r.captureStartedAtMs ?? started.startedAtMs),
				error: started.micIncluded
					? null
					: "Recording the call, but not your own microphone.",
			},
		}));
	} catch (error) {
		await patchRecord((r) => ({
			...r,
			audio: {
				...r.audio,
				status: "failed",
				mic,
				error: `Audio capture failed: ${errorMessage(error)}`,
			},
		}));
	}
}

async function stopLesson(): Promise<CaptureRecord> {
	const current = await loadRecord();
	if (current.sessionId === null) {
		const next = { ...current, status: "idle" as const };
		await saveRecord(next);
		return next;
	}

	await saveRecord({ ...current, status: "stopping" });
	await broadcast({ ...current, status: "stopping" });

	// Flush before closing because append() rejects non-recording sessions.
	await flush();

	const afterFlush = await loadRecord();
	const auth = await loadAuth();
	const authConnected = auth !== null && authStatus(auth, Date.now()) === "connected";

	// Keep the session open until buffered lines are saved. Audio continues with
	// the lesson.
	if (!authConnected || afterFlush.buffer.length > 0) {
		const next: CaptureRecord = {
			...afterFlush,
			status: "recording",
			error: authConnected
				? `${afterFlush.buffer.length} lines still to upload. Press Stop again in a moment.`
				: "Sign-in expired before this lesson could be saved. Reconnect, then press Stop again.",
		};
		await saveRecord(next);
		return next;
	}

	const stopped = await endAudioRecording(afterFlush);

	try {
		await createConvexClient(auth).mutation(api.lessonSessions.finishCapture, {
			sessionId: stopped.sessionId as Id<"lessonSessions">,
		});
	} catch (error) {
		const authFailure = isAuthFailure(error);
		if (authFailure) {
			await expireAuth();
		}
		const next: CaptureRecord = {
			...stopped,
			status: "recording",
			error: `Could not close the lesson: ${errorMessage(error)}`,
		};
		await saveRecord(next);
		return next;
	}

	return finalizeAudio(await loadRecord(), auth);
}

/** Stops audio and stores its duration. */
async function endAudioRecording(record: CaptureRecord): Promise<CaptureRecord> {
	if (record.audio.status !== "recording") return record;
	try {
		const stopped = await audio.stopAudio();
		console.info("[verbatim] audio captured", {
			durationMs: stopped.durationMs,
			wallClockMs: stopped.wallClockMs,
			driftMs: stopped.wallClockMs - stopped.durationMs,
			offsetMs: record.audio.offsetMs,
			sizeBytes: stopped.sizeBytes,
			mimeType: stopped.mimeType,
		});
		return patchRecord((r) => ({
			...r,
			audio: {
				...r.audio,
				status: "recorded",
				durationMs: stopped.durationMs,
				error: null,
			},
		}));
	} catch (error) {
		return patchRecord((r) => ({
			...r,
			audio: {
				...r.audio,
				status: "failed",
				error: `Recording could not be closed: ${errorMessage(error)}`,
			},
		}));
	}
}

/** Uploads audio, or closes the session as incomplete when no audio exists. */
async function finalizeAudio(
	record: CaptureRecord,
	auth: StoredAuth,
): Promise<CaptureRecord> {
	const sessionId = record.sessionId as Id<"lessonSessions">;
	const convex = createConvexClient(auth);
	const recorded =
		record.audio.status === "recorded" || record.audio.status === "uploading";

	if (!recorded) {
		try {
			await convex.mutation(api.lessonSessions.finishWithoutAudio, { sessionId });
		} catch (error) {
			return patchRecord((r) => ({
				...r,
				status: "error",
				error: `Could not close the lesson: ${errorMessage(error)}`,
			}));
		}
		return resetAfterStop(record);
	}

	await patchRecord((r) => ({
		...r,
		audio: { ...r.audio, status: "uploading", error: null },
	}));

	try {
		const uploadUrl = await convex.mutation(
			api.lessonSessions.generateAudioUploadUrl,
			{ sessionId },
		);
		const uploaded = await audio.uploadAudio(uploadUrl);
		await convex.mutation(api.lessonSessions.attachAudio, {
			sessionId,
			storageId: uploaded.storageId as Id<"_storage">,
			durationMs: record.audio.durationMs ?? 0,
			offsetMs: record.audio.offsetMs ?? 0,
		});
		await audio.discardAudio();
	} catch (error) {
		if (isAuthFailure(error)) {
			await expireAuth();
		}
		const message = errorMessage(error);
		// A lost offscreen blob cannot be recovered by retrying.
		const lost = message.includes("No recording to upload");
		return patchRecord((r) => ({
			...r,
			status: "error",
			error: lost
				? "The recording was lost before it could be uploaded. Press Stop to close the lesson with its transcript only."
				: `Audio upload failed: ${message}. Press Retry to send it again.`,
			audio: {
				...r.audio,
				status: lost ? "failed" : "recorded",
				error: null,
			},
		}));
	}

	return resetAfterStop(record);
}

/** Returns to idle while retaining the last audio summary. */
async function resetAfterStop(record: CaptureRecord): Promise<CaptureRecord> {
	stopFlushLoop();
	await audio.closeOffscreen();
	// The tab keeps its capture grant until navigation, so the next lesson can
	// start audio immediately.
	return patchRecord((r) => ({
		...r,
		status: "idle",
		sessionId: null,
		buffer: [],
		error: null,
		captureStartedAtMs: null,
		tabId: null,
		audio: {
			...IDLE_AUDIO,
			status: record.audio.durationMs === null ? "off" : "saved",
			durationMs: record.audio.durationMs,
			offsetMs: record.audio.offsetMs,
			mic: record.audio.mic,
		},
	}));
}

async function bufferLines(lines: FinalizedLine[]): Promise<CaptureRecord> {
	const record = await loadRecord();
	if (record.status !== "recording" || record.sessionId === null) {
		return record;
	}
	let nextOrder = record.nextOrder;
	const next: CaptureRecord = {
		...record,
		buffer: [
			...record.buffer,
			...lines.map((line) => ({ ...line, order: nextOrder++ })),
		],
		nextOrder,
	};
	await saveRecord(next);
	return next;
}

type BackgroundTargetMessage = { target: "background"; type: "audio:micGranted" };

function isMeetUrl(url: string | undefined): boolean {
	return url !== undefined && url.startsWith("https://meet.google.com/");
}

export function registerBackground(): void {
	browser.runtime.onMessage.addListener(
		(message: ContentMessage | BackgroundTargetMessage, sender, sendResponse) => {
			// Ignore requests owned by the offscreen listener.
			if ("target" in message && message.target !== "background") return false;

			const tabId = sender.tab?.id ?? null;
			void (async () => {
				if ("target" in message) {
					// The permission page reports a successful grant.
					const record = await patchRecord((r) => ({
						...r,
						audio: { ...r.audio, mic: "granted" },
					}));
					await broadcast(record);
					sendResponse({ ok: true });
					return;
				}
				switch (message.type) {
					case "capture:getState": {
						const record = await loadRecord();
						if (record.status === "recording") startFlushLoop();
						sendResponse(await toState(record, tabId));
						return;
					}
					case "capture:start": {
						const record = await startLesson(tabId);
						sendResponse(await toState(record, tabId));
						await broadcast(record);
						return;
					}
					case "capture:stop": {
						const record = await stopLesson();
						sendResponse(await toState(record, tabId));
						await broadcast(record);
						return;
					}
					case "capture:lines": {
						const record = await bufferLines(message.lines);
						sendResponse(await toState(record, tabId));
						return;
					}
					case "capture:connect": {
						await browser.tabs.create({ url: CONNECT_URL });
						sendResponse(await toState(await loadRecord(), tabId));
						return;
					}
					case "capture:enableMic": {
						await audio.openMicPermissionPage();
						sendResponse(await toState(await loadRecord(), tabId));
						return;
					}
				}
			})();
			// Keeps the message channel open for the async work above.
			return true;
		},
	);

	// Toolbar invocation grants tab capture and may start audio mid-lesson.
	browser.action.onClicked.addListener((tab) => {
		void (async () => {
			if (tab.id === undefined || !isMeetUrl(tab.url)) return;
			await audio.markArmed(tab.id);
			const record = await loadRecord();
			if (record.status === "recording" && record.audio.status !== "recording") {
				await beginAudio();
			}
			await broadcast(await loadRecord());
		})();
	});

	// Navigation revokes tab-capture grants.
	browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (changeInfo.status === "loading" && changeInfo.url !== undefined) {
			void audio.clearArmed(tabId);
		}
	});
	browser.tabs.onRemoved.addListener((tabId) => {
		void audio.clearArmed(tabId);
	});

	/** Receives tokens from origins allowed by Chrome's external messaging rules. */
	browser.runtime.onMessageExternal.addListener(
		(message: ExternalMessage, sender, sendResponse) => {
			void (async () => {
				if (message.type === "verbatim:ping") {
					sendResponse({
						ok: true,
						extensionVersion: browser.runtime.getManifest().version,
					} satisfies ExternalResponse);
					return;
				}
				if (message.type !== "verbatim:connect") return;

				if (typeof message.token !== "string" || message.token === "") {
					sendResponse({
						ok: false,
						error: "No token in connect message",
					} satisfies ExternalResponse);
					return;
				}

				await saveAuth({
					token: message.token,
					convexUrl: message.convexUrl,
					account: message.account ?? null,
				});
				sendResponse({
					ok: true,
					extensionVersion: browser.runtime.getManifest().version,
				} satisfies ExternalResponse);

				// A reconnect resumes a parked queue.
				const record = await loadRecord();
				await broadcast(record);
				if (record.status === "recording") {
					startFlushLoop();
					await flush();
				}

				// Close the reconnect tab when the extension opened it.
				if (sender.tab?.id !== undefined) {
					browser.tabs.remove(sender.tab.id, () => {
						void browser.runtime.lastError;
					});
				}
			})();
			return true;
		},
	);

	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === FLUSH_ALARM) {
			void flush();
		}
	});

	// Restore flushing if the worker restarted during a lesson.
	void loadRecord().then(async (record) => {
		if (record.status !== "recording") return;
		startFlushLoop();
		await updateRecordingBadge(record.status);
		// A worker restart also loses the offscreen recording.
		if (record.audio.status === "recording" && !(await audio.hasOffscreen())) {
			await patchRecord((r) => ({
				...r,
				audio: {
					...r.audio,
					status: "failed",
					error: "Audio recording stopped when the extension restarted.",
				},
			}));
			await broadcast(await loadRecord());
		}
	});
}
