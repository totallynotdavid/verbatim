import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { CaptionCapture } from "../content/captions";
import { Overlay } from "../content/overlay";
import type {
	BackgroundMessage,
	CaptureState,
	ContentMessage,
	FinalizedLine,
} from "../shared/protocol";

/** Owns the Meet overlay and caption reader. The service worker retains auth. */
export default defineContentScript({
	matches: ["https://meet.google.com/*"],
	runAt: "document_idle",

	main(ctx) {
		function send(message: ContentMessage): Promise<CaptureState | undefined> {
			return new Promise((resolve) => {
				browser.runtime.sendMessage(message, (response) => {
					// A stopped service worker can drop the response.
					void browser.runtime.lastError;
					resolve(response as CaptureState | undefined);
				});
			});
		}

		const capture = new CaptionCapture({
			onLine: (line: FinalizedLine) => {
				console.debug("[verbatim] line", line);
				void send({ type: "capture:lines", lines: [line] });
			},
		});

		const overlay = new Overlay({
			onStart: () => void send({ type: "capture:start" }).then(applyState),
			onStop: () => void send({ type: "capture:stop" }).then(applyState),
			onConnect: () => void send({ type: "capture:connect" }),
			onEnableMic: () =>
				void send({ type: "capture:enableMic" }).then(applyState),
		});

		let capturing = false;

		function applyState(state: CaptureState | undefined): void {
			if (state === undefined) return;
			overlay.render(state);

			const shouldCapture = state.status === "recording";
			if (shouldCapture && !capturing) {
				capture.start(state.captureStartedAtMs ?? undefined);
				capturing = true;
				if (!capture.captionsFound) {
					console.warn(
						"[verbatim] captions panel not found yet. Turn captions on in Meet.",
					);
				}
			} else if (!shouldCapture && capturing) {
				capture.stop();
				capturing = false;
			}
		}

		browser.runtime.onMessage.addListener((message: BackgroundMessage) => {
			if (message.type === "capture:state") {
				applyState(message.state);
			}
		});

		overlay.mount();
		void send({ type: "capture:getState" }).then(applyState);

		// Meet can replace the document root while navigating between the lobby and call.
		const keepMounted = new MutationObserver(() => overlay.mount());
		keepMounted.observe(document.documentElement, {
			childList: true,
			subtree: false,
		});

		// Remove the observer and overlay when the extension context is invalidated.
		ctx.onInvalidated(() => {
			keepMounted.disconnect();
			if (capturing) capture.stop();
			overlay.unmount();
		});

		ctx.addEventListener(window, "pagehide", () => {
			if (capturing) capture.stop();
		});
	},
});
