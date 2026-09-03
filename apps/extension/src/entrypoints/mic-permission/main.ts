import { browser } from "wxt/browser";

/** Requests microphone access from a visible page for the offscreen recorder. */

const status = document.getElementById("status");

function show(text: string): void {
	if (status === null) return;
	status.textContent = text;
	status.className = "";
}

function showError(text: string): void {
	if (status === null) return;
	status.textContent = text;
	status.className = "err";
}

navigator.mediaDevices
	.getUserMedia({ audio: true })
	.then((stream) => {
		// Stop the temporary stream. Only the permission is needed.
		for (const track of stream.getTracks()) track.stop();
		show("Microphone enabled. Closing this tab…");
		void browser.runtime.sendMessage({
			target: "background",
			type: "audio:micGranted",
		});
		setTimeout(() => window.close(), 800);
	})
	.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		showError(
			`Microphone access was not granted (${message}). Lessons will still record the other participant from the Meet tab, but not your own voice. You can change this under chrome://settings/content/microphone.`,
		);
	});
