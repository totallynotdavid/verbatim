import type { CaptureState } from "../shared/protocol";

const STYLES = `
:host { all: initial; }
.panel {
	position: fixed;
	right: 16px;
	bottom: 96px;
	z-index: 2147483647;
	width: 236px;
	padding: 12px;
	border-radius: 10px;
	background: #16181d;
	color: #e8eaed;
	font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
	border: 1px solid rgba(255, 255, 255, 0.12);
}
.title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
	margin-bottom: 8px;
}
.dot {
	width: 9px;
	height: 9px;
	border-radius: 50%;
	background: #6b7280;
	flex: none;
}
.dot.live {
	background: #ef4444;
	animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse { 50% { opacity: 0.25; } }
.detail { color: #9aa0a6; margin-bottom: 10px; }
.detail.warn { color: #fbbf24; }
.detail.err { color: #f87171; }
.audio {
	display: flex;
	align-items: baseline;
	gap: 6px;
	color: #9aa0a6;
	margin-bottom: 10px;
	font-size: 12px;
}
.audio.warn { color: #fbbf24; }
.audio.err { color: #f87171; }
button.link {
	width: auto;
	padding: 0;
	margin-top: -2px;
	border: 0;
	background: none;
	color: #93c5fd;
	font-size: 12px;
	font-weight: 600;
	text-decoration: underline;
}
button.link:hover { background: none; color: #bfdbfe; }
button {
	width: 100%;
	padding: 7px 10px;
	border-radius: 7px;
	border: 1px solid rgba(255, 255, 255, 0.16);
	background: #2b2f36;
	color: #e8eaed;
	font: inherit;
	font-weight: 600;
	cursor: pointer;
}
button:hover { background: #363b44; }
button:disabled { opacity: 0.5; cursor: default; }
button.stop { background: #7f1d1d; border-color: #b91c1c; }
button.stop:hover { background: #991b1b; }
`;

export type OverlayActions = {
	onStart: () => void;
	onStop: () => void;
	onConnect: () => void;
	onEnableMic: () => void;
};

export class Overlay {
	private readonly host: HTMLElement;
	private readonly shadow: ShadowRoot;
	private readonly dot: HTMLElement;
	private readonly detail: HTMLElement;
	private readonly audio: HTMLElement;
	private readonly audioText: HTMLElement;
	private readonly micButton: HTMLButtonElement;
	private readonly button: HTMLButtonElement;
	private readonly actions: OverlayActions;
	private state: CaptureState | null = null;

	constructor(actions: OverlayActions) {
		this.actions = actions;
		this.host = document.createElement("div");
		this.host.id = "verbatim-capture-root";
		// Isolate the overlay from Meet's styles and the overlay's styles from Meet.
		this.shadow = this.host.attachShadow({ mode: "open" });

		const style = document.createElement("style");
		style.textContent = STYLES;

		const panel = document.createElement("div");
		panel.className = "panel";

		const title = document.createElement("div");
		title.className = "title";
		this.dot = document.createElement("span");
		this.dot.className = "dot";
		const label = document.createElement("span");
		label.textContent = "Verbatim";
		title.append(this.dot, label);

		this.detail = document.createElement("div");
		this.detail.className = "detail";

		this.audio = document.createElement("div");
		this.audio.className = "audio";
		this.audioText = document.createElement("span");
		this.micButton = document.createElement("button");
		this.micButton.className = "link";
		this.micButton.textContent = "Enable microphone";
		this.micButton.hidden = true;
		this.micButton.addEventListener("click", () => this.actions.onEnableMic());
		this.audio.append(this.audioText, this.micButton);

		this.button = document.createElement("button");
		this.button.addEventListener("click", () => this.onClick());

		panel.append(title, this.detail, this.audio, this.button);
		this.shadow.append(style, panel);
	}

	mount(): void {
		if (!this.host.isConnected) {
			document.documentElement.append(this.host);
		}
	}

	unmount(): void {
		this.host.remove();
	}

	render(state: CaptureState): void {
		this.state = state;
		this.dot.className = state.status === "recording" ? "dot live" : "dot";
		this.renderDetail(state);
		this.renderAudio(state);
		this.renderButton(state);
	}

	private renderAudio(state: CaptureState): void {
		if (state.auth !== "connected") {
			this.audio.hidden = true;
			return;
		}
		this.audio.hidden = false;
		const { text, tone } = audioNote(state);
		this.audio.className = tone === "" ? "audio" : `audio ${tone}`;
		this.audioText.textContent = text;
		// Chrome prompts from an extension page, not the injected overlay.
		this.micButton.hidden =
			state.audio.mic === "granted" || state.status === "stopping";
	}

	private renderDetail(state: CaptureState): void {
		const recording = state.status === "recording";
		if (state.error !== null) {
			this.detail.className = "detail err";
			this.detail.textContent = state.error;
			return;
		}
		if (state.auth !== "connected") {
			this.detail.className = "detail warn";
			this.detail.textContent =
				state.auth === "expired"
					? "Sign-in expired. Reconnect to keep uploading."
					: "Not connected to your Verbatim account.";
			return;
		}

		this.detail.className = "detail";
		if (recording) {
			this.detail.textContent = `Recording captions · ${state.uploaded} saved${
				state.pending > 0 ? `, ${state.pending} pending` : ""
			}`;
			return;
		}
		if (state.status === "idle" && state.uploaded > 0) {
			this.detail.textContent = `Last lesson saved ${state.uploaded} lines.`;
			return;
		}
		this.detail.textContent =
			state.account !== null ? `Connected as ${state.account}.` : "Connected.";
	}

	private renderButton(state: CaptureState): void {
		const recording = state.status === "recording";
		this.button.disabled = false;
		this.button.className = "";
		if (needsStop(state)) {
			this.button.textContent = isRetryableUpload(state)
				? "Retry saving audio"
				: "Finish lesson";
			return;
		}
		if (state.auth !== "connected") {
			this.button.textContent =
				state.auth === "expired" ? "Reconnect" : "Connect account";
			return;
		}
		if (recording) {
			this.button.textContent = "Stop lesson";
			this.button.className = "stop";
			return;
		}
		if (state.status === "starting" || state.status === "stopping") {
			this.button.textContent =
				state.status === "starting" ? "Starting…" : "Stopping…";
			this.button.disabled = true;
			return;
		}
		this.button.textContent = "Start lesson";
	}

	private onClick(): void {
		const state = this.state;
		if (state === null) return;
		if (state.auth !== "connected") {
			this.actions.onConnect();
			return;
		}
		if (state.status === "recording" || needsStop(state)) {
			this.actions.onStop();
			return;
		}
		if (state.status === "idle" || state.status === "error") {
			this.actions.onStart();
		}
	}
}

function needsStop(state: CaptureState): boolean {
	return state.status === "error" && state.sessionId !== null;
}

function isRetryableUpload(state: CaptureState): boolean {
	return needsStop(state) && state.audio.status === "recorded";
}

function formatDuration(ms: number): string {
	const total = Math.round(ms / 1000);
	const minutes = Math.floor(total / 60);
	return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function audioNote(state: CaptureState): {
	text: string;
	tone: "" | "warn" | "err";
} {
	const audioState = state.audio;
	if (audioState.status === "failed") {
		return { text: audioState.error ?? "Audio capture failed.", tone: "err" };
	}
	if (audioState.status === "uploading") {
		return { text: "Saving audio…", tone: "" };
	}
	if (audioState.status === "recording") {
		return audioState.micIncluded
			? { text: "Audio: this call and your microphone.", tone: "" }
			: {
					text: "Audio: this call only. Your own voice is not being recorded.",
					tone: "warn",
				};
	}
	if (state.status === "recording" || state.status === "starting") {
		return {
			text: "No audio: click the Verbatim toolbar icon to start recording this call.",
			tone: "warn",
		};
	}
	if (audioState.status === "recorded") {
		return { text: "Audio recorded, not saved yet.", tone: "warn" };
	}
	if (audioState.status === "saved" && audioState.durationMs !== null) {
		return {
			text: `Audio saved (${formatDuration(audioState.durationMs)}).`,
			tone: "",
		};
	}
	return audioState.armed
		? { text: "Audio ready for the next lesson.", tone: "" }
		: {
				text: "Click the Verbatim toolbar icon once to allow audio recording.",
				tone: "warn",
			};
}
