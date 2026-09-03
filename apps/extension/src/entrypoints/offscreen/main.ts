import { browser } from "wxt/browser";
import {
	discardRecording,
	queryMicPermission,
	startRecording,
	stopRecording,
	uploadRecording,
} from "../../offscreen/recorder";
import type { OffscreenRequest, OffscreenResponse } from "../../shared/protocol";

/** Handles requests for the offscreen recorder. Other messages pass through. */
browser.runtime.onMessage.addListener(
	(message: OffscreenRequest, _sender, sendResponse) => {
		if (message?.target !== "offscreen") return false;

		void handle(message).then(
			(data) => sendResponse({ ok: true, data } satisfies OffscreenResponse<unknown>),
			(error: unknown) =>
				sendResponse({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				} satisfies OffscreenResponse<never>),
		);
		return true;
	},
);

async function handle(message: OffscreenRequest): Promise<unknown> {
	switch (message.type) {
		case "audio:permission":
			return { mic: await queryMicPermission() };
		case "audio:start":
			return startRecording(message.streamId);
		case "audio:stop":
			return stopRecording();
		case "audio:upload":
			return uploadRecording(message.uploadUrl);
		case "audio:discard":
			discardRecording();
			return {};
	}
}
