import type { CaptureState } from "../shared/protocol";

/** Floating capture control injected into the Meet page. */

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
};

export class Overlay {
	private readonly host: HTMLElement;
	private readonly shadow: ShadowRoot;
	private readonly dot: HTMLElement;
	private readonly detail: HTMLElement;
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

		this.button = document.createElement("button");
		this.button.addEventListener("click", () => this.onClick());

		panel.append(title, this.detail, this.button);
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
		this.renderButton(state);
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
		if (state.status === "recording") {
			this.actions.onStop();
			return;
		}
		if (state.status === "idle" || state.status === "error") {
			this.actions.onStart();
		}
	}
}
