import type { FinalizedLine } from "../shared/protocol";

/** Prevents in-place caption edits from becoming separate transcript lines. */
export const SETTLE_MS = 1500;

export const POLL_INTERVAL_MS = 1000;

/**
 * Drop an unchanged row that Meet tears down and re-adds within this window.
 */
const DEDUPE_WINDOW_MS = 10_000;

// Meet's private class names have changed before, so each selector has a fallback.
const ROW_CLASS = "nMcdL";
const SPEAKER_CLASS = "NWpY1d";
const TEXT_CLASSES = ["ygicle", "VbkSUe"];

/**
 * ARIA labels vary by locale. Match known caption terms and use structure as a
 * fallback.
 */
const CAPTION_LABEL_HINTS = [
	"caption",
	"subtitle",
	"subtítulo",
	"subtitulo",
	"legenda",
	"sous-titre",
	"untertitel",
];

type Draft = {
	speaker: string | undefined;
	text: string;
	firstSeenMs: number;
	lastChangedMs: number;
	/**
	 * Text already emitted for this row. Set when a row settles but stays on
	 * screen. Anything Meet appends afterwards is emitted as a separate line.
	 */
	emitted: string;
};

export type CaptionCaptureOptions = {
	onLine: (line: FinalizedLine) => void;
	/** Injectable for tests. Defaults to `Date.now`. */
	now?: () => number;
	/** Injectable for tests. Defaults to `document`. */
	root?: Document | Element;
	settleMs?: number;
};

/** Reads Meet's live caption panel and emits rows after their text settles. */
export class CaptionCapture {
	private readonly onLine: (line: FinalizedLine) => void;
	private readonly now: () => number;
	private readonly root: Document | Element;
	private readonly settleMs: number;

	private observer: MutationObserver | null = null;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private region: Element | null = null;
	private startedAtMs = 0;
	private order = 0;
	private drafts = new Map<Element, Draft>();
	private recent: Array<{ key: string; atMs: number }> = [];

	constructor(options: CaptionCaptureOptions) {
		this.onLine = options.onLine;
		this.now = options.now ?? (() => Date.now());
		this.root = options.root ?? document;
		this.settleMs = options.settleMs ?? SETTLE_MS;
	}

	/** @param startedAtMs Epoch timestamp shared by transcript and audio. */
	start(startedAtMs?: number): void {
		if (this.observer !== null) return;
		this.startedAtMs = startedAtMs ?? this.now();
		this.order = 0;
		this.drafts.clear();
		this.recent = [];

		// Observe the document so remounting the captions panel does not stop capture.
		const target =
			this.root.nodeType === 9
				? ((this.root as Document).documentElement ??
					(this.root as unknown as Node))
				: (this.root as Node);
		this.observer = new MutationObserver(() => this.scan());
		this.observer.observe(target, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		// Polling lets settled rows finalize after the DOM goes quiet.
		this.pollTimer = setInterval(() => this.scan(), POLL_INTERVAL_MS);
		this.scan();
	}

	/** Stops observation and emits remaining drafts. */
	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.pollTimer !== null) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		for (const draft of this.drafts.values()) {
			this.finalize(draft);
		}
		this.drafts.clear();
	}

	/** True once a captions region has been located at least once. */
	get captionsFound(): boolean {
		return this.region !== null;
	}

	scan(): void {
		const now = this.now();
		const region = this.findCaptionsRegion();
		this.region = region;

		const rows = region === null ? [] : findRows(region);
		const live = new Set(rows);

		for (const row of rows) {
			const speaker = extractSpeaker(row);
			const text = extractText(row);
			if (text === "") continue;

			const draft = this.drafts.get(row);
			if (draft === undefined) {
				this.drafts.set(row, {
					speaker,
					text,
					firstSeenMs: now,
					lastChangedMs: now,
					emitted: "",
				});
				continue;
			}

			// Meet can recycle a row for another speaker, so close the current draft.
			if (speaker !== draft.speaker) {
				this.finalize(draft);
				this.drafts.set(row, {
					speaker,
					text,
					firstSeenMs: now,
					lastChangedMs: now,
					emitted: "",
				});
				continue;
			}

			if (text !== draft.text) {
				draft.text = text;
				draft.lastChangedMs = now;
			}
		}

		for (const [row, draft] of [...this.drafts]) {
			if (!live.has(row)) {
				this.finalize(draft);
				this.drafts.delete(row);
				continue;
			}
			if (now - draft.lastChangedMs >= this.settleMs) {
				this.finalize(draft);
			}
		}

		this.recent = this.recent.filter((e) => now - e.atMs < DEDUPE_WINDOW_MS);
	}

	/** Emits the part of a draft that has not been emitted yet. */
	private finalize(draft: Draft): void {
		const remainder = draft.text.startsWith(draft.emitted)
			? draft.text.slice(draft.emitted.length).trim()
			: draft.text.trim();
		if (remainder === "") return;

		const key = `${draft.speaker ?? ""}\0${remainder}`;
		const now = this.now();
		if (this.recent.some((e) => e.key === key)) {
			draft.emitted = draft.text;
			return;
		}
		this.recent.push({ key, atMs: now });

		const line: FinalizedLine = {
			text: remainder,
			startMs: Math.max(0, draft.firstSeenMs - this.startedAtMs),
			endMs: Math.max(0, draft.lastChangedMs - this.startedAtMs),
			order: this.order++,
		};
		if (draft.speaker !== undefined) {
			line.speakerLabel = draft.speaker;
		}
		this.onLine(line);

		// Keep the draft so appended speech starts a new capture segment.
		draft.emitted = draft.text;
		draft.firstSeenMs = draft.lastChangedMs;
	}

	private findCaptionsRegion(): Element | null {
		const scope: ParentNode = this.root;

		// Prefer the ARIA region when Meet marks it as a caption panel.
		for (const region of scope.querySelectorAll('[role="region"]')) {
			const label = region.getAttribute("aria-label")?.toLowerCase() ?? "";
			if (CAPTION_LABEL_HINTS.some((hint) => label.includes(hint))) {
				return region;
			}
		}

		// Otherwise find a known row and use its region or parent container.
		const row = scope.querySelector(`.${ROW_CLASS}`);
		if (row !== null) {
			return row.closest('[role="region"]') ?? row.parentElement;
		}
		return null;
	}
}

/** Returns caption rows without Meet's controls. */
export function findRows(region: Element): Element[] {
	const byClass = [...region.querySelectorAll(`.${ROW_CLASS}`)];
	if (byClass.length > 0) {
		return byClass.filter((row) => !isMeetControl(row));
	}

	// Avatar-backed rows are the fallback because Meet's controls have no avatar.
	const rows: Element[] = [];
	for (const avatar of region.querySelectorAll("img")) {
		let row: Element | null = avatar.parentElement;
		while (row !== null && row !== region && row.children.length < 2) {
			row = row.parentElement;
		}
		if (row === null || row === region || isMeetControl(row)) continue;
		if ((row.textContent ?? "").trim().length < 2) continue;
		if (!rows.includes(row)) rows.push(row);
	}
	return rows;
}

/** Excludes Meet controls that live inside the captions region. */
function isMeetControl(el: Element): boolean {
	if (el.matches('button, [role="button"], [role="toolbar"], [role="menu"]')) {
		return true;
	}
	// Keep a row that has a control only when it also has caption text.
	const control = el.querySelector('button, [role="button"]');
	if (control === null) return false;
	const withoutControl = (el.textContent ?? "").replace(
		control.textContent ?? "",
		"",
	);
	return withoutControl.trim() === "";
}

export function extractSpeaker(row: Element): string | undefined {
	const byClass = row.querySelector(`.${SPEAKER_CLASS}`);
	if (byClass !== null) {
		const name = (byClass.textContent ?? "").trim();
		return name === "" ? undefined : name;
	}

	// Fall back to a short first child.
	for (const child of row.children) {
		const text = (child.textContent ?? "").trim();
		if (text === "") continue;
		return text.length <= 64 && row.children.length > 1 ? text : undefined;
	}
	return undefined;
}

export function extractText(row: Element): string {
	const spans = [
		...row.querySelectorAll(TEXT_CLASSES.map((cls) => `.${cls}`).join(", ")),
	];
	// The classes can nest, so keep only outermost matches to avoid duplicate text.
	const outermost = spans.filter(
		(span) => !spans.some((other) => other !== span && other.contains(span)),
	);
	if (outermost.length > 0) {
		return outermost
			.map((span) => (span.textContent ?? "").trim())
			.filter((text) => text !== "")
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
	}

	// Fall back to row text without the speaker.
	const speaker = extractSpeaker(row);
	let text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
	if (speaker !== undefined && text.startsWith(speaker)) {
		text = text.slice(speaker.length).trim();
	}
	return text;
}
