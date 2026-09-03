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

async function toState(record: CaptureRecord): Promise<CaptureState> {
	const auth = await loadAuth();
	return {
		status: record.status,
		auth: authStatus(auth, Date.now()),
		sessionId: record.sessionId,
		uploaded: record.uploaded,
		pending: record.buffer.length,
		error: record.error,
		account: auth?.account ?? null,
	};
}

/** Pushes state to every Meet tab so overlays stay in sync. */
async function broadcast(record: CaptureRecord): Promise<void> {
	const state = await toState(record);
	const tabs = await browser.tabs.query({ url: "https://meet.google.com/*" });
	for (const tab of tabs) {
		if (tab.id === undefined) continue;
		browser.tabs.sendMessage(tab.id, { type: "capture:state", state }, () => {
			// Tabs without the content script loaded yet will not answer.
			void browser.runtime.lastError;
		});
	}
}

function startFlushLoop(): void {
	if (flushTimer === null) {
		flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
	}
	// The interval handles frequent uploads while the worker is alive; the alarm
	// revives it after suspension.
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

async function startLesson(): Promise<CaptureRecord> {
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
		const next: CaptureRecord = {
			status: "recording",
			sessionId,
			uploaded: 0,
			buffer: [],
			nextOrder: 0,
			error: null,
		};
		await saveRecord(next);
		startFlushLoop();
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

	// Keep the session open until every buffered line is saved.
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

	try {
		await createConvexClient(auth).mutation(api.lessonSessions.finishCapture, {
			sessionId: afterFlush.sessionId as Id<"lessonSessions">,
		});
	} catch (error) {
		const authFailure = isAuthFailure(error);
		if (authFailure) {
			await expireAuth();
		}
		const next: CaptureRecord = {
			...afterFlush,
			status: "recording",
			error: `Could not close the lesson: ${errorMessage(error)}`,
		};
		await saveRecord(next);
		return next;
	}

	stopFlushLoop();
	const next: CaptureRecord = {
		...afterFlush,
		status: "idle",
		sessionId: null,
		buffer: [],
		error: null,
	};
	await saveRecord(next);
	return next;
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

export function registerBackground(): void {
	browser.runtime.onMessage.addListener(
		(message: ContentMessage, _sender, sendResponse) => {
			void (async () => {
				switch (message.type) {
					case "capture:getState": {
						const record = await loadRecord();
						if (record.status === "recording") startFlushLoop();
						sendResponse(await toState(record));
						return;
					}
					case "capture:start": {
						const record = await startLesson();
						sendResponse(await toState(record));
						await broadcast(record);
						return;
					}
					case "capture:stop": {
						const record = await stopLesson();
						sendResponse(await toState(record));
						await broadcast(record);
						return;
					}
					case "capture:lines": {
						const record = await bufferLines(message.lines);
						sendResponse(await toState(record));
						return;
					}
					case "capture:connect": {
						await browser.tabs.create({ url: CONNECT_URL });
						sendResponse(await toState(await loadRecord()));
						return;
					}
				}
			})();
			// Keeps the message channel open for the async work above.
			return true;
		},
	);

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
	void loadRecord().then((record) => {
		if (record.status === "recording") startFlushLoop();
	});
}
