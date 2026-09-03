import { browser } from "wxt/browser";
import {
	MIC_PERMISSION_URL,
	OFFSCREEN_URL,
} from "../shared/config";
import type {
	AudioStartResult,
	AudioStopResult,
	AudioUploadResult,
	MicPermission,
	MicPermissionResult,
	OffscreenRequest,
	OffscreenResponse,
} from "../shared/protocol";

/** Bridges the service worker and the offscreen recorder. */

/** Tab IDs with a user-granted capture permission. */
const ARMED_KEY = "verbatim.armedTabs";

async function armedTabs(): Promise<number[]> {
	const stored = await browser.storage.session.get(ARMED_KEY);
	return (stored[ARMED_KEY] as number[] | undefined) ?? [];
}

export async function markArmed(tabId: number): Promise<void> {
	const tabs = await armedTabs();
	if (tabs.includes(tabId)) return;
	await browser.storage.session.set({ [ARMED_KEY]: [...tabs, tabId] });
}

export async function clearArmed(tabId: number): Promise<void> {
	const tabs = await armedTabs();
	if (!tabs.includes(tabId)) return;
	await browser.storage.session.set({
		[ARMED_KEY]: tabs.filter((id) => id !== tabId),
	});
}

export async function isArmed(tabId: number | null): Promise<boolean> {
	if (tabId === null) return false;
	return (await armedTabs()).includes(tabId);
}

let creating: Promise<void> | null = null;

export async function hasOffscreen(): Promise<boolean> {
	const contexts = await browser.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
	});
	return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
	if (await hasOffscreen()) return;
	// Prevent concurrent starts from creating duplicate documents.
	creating ??= browser.offscreen
		.createDocument({
			url: OFFSCREEN_URL,
			reasons: ["USER_MEDIA"],
			justification:
				"Records the lesson's mixed Meet tab and microphone audio while the call runs.",
		})
		.finally(() => {
			creating = null;
		});
	await creating;
}

export async function closeOffscreen(): Promise<void> {
	if (!(await hasOffscreen())) return;
	await browser.offscreen.closeDocument();
}

/** Routes a recorder request through the offscreen document. */
async function callOffscreen<T>(request: OffscreenRequest): Promise<T> {
	await ensureOffscreen();
	const response = (await browser.runtime.sendMessage(request)) as
		| OffscreenResponse<T>
		| undefined;
	if (response === undefined) {
		throw new Error("The audio recorder did not respond");
	}
	if (!response.ok) {
		throw new Error(response.error);
	}
	return response.data;
}

export async function readMicPermission(): Promise<MicPermission> {
	try {
		const result = await callOffscreen<MicPermissionResult>({
			target: "offscreen",
			type: "audio:permission",
		});
		return result.mic;
	} catch {
		return "unknown";
	}
}

/** Mints a tab-capture stream ID for an armed tab. */
export async function getStreamId(tabId: number): Promise<string> {
	return browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
}

export function startAudio(streamId: string): Promise<AudioStartResult> {
	return callOffscreen<AudioStartResult>({
		target: "offscreen",
		type: "audio:start",
		streamId,
	});
}

export function stopAudio(): Promise<AudioStopResult> {
	return callOffscreen<AudioStopResult>({
		target: "offscreen",
		type: "audio:stop",
	});
}

export function uploadAudio(uploadUrl: string): Promise<AudioUploadResult> {
	return callOffscreen<AudioUploadResult>({
		target: "offscreen",
		type: "audio:upload",
		uploadUrl,
	});
}

export function discardAudio(): Promise<unknown> {
	return callOffscreen<unknown>({
		target: "offscreen",
		type: "audio:discard",
	});
}

/** Opens the visible page that requests microphone access. */
export async function openMicPermissionPage(): Promise<void> {
	await browser.tabs.create({ url: browser.runtime.getURL(MIC_PERMISSION_URL) });
}
