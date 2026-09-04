/** Character ranges in immutable transcript text. */

export type TextRange = { start: number; end: number };

/** Removes surrounding whitespace so highlights match the selected words. */
export function trimRange(text: string, range: TextRange): TextRange | null {
	let { start, end } = range;
	start = Math.max(0, Math.min(start, text.length));
	end = Math.max(0, Math.min(end, text.length));
	if (end < start) [start, end] = [end, start];
	while (start < end && /\s/.test(text[start] ?? "")) start++;
	while (end > start && /\s/.test(text[end - 1] ?? "")) end--;
	if (start >= end) return null;
	// A full-line range is stored as an unanchored note.
	if (start === 0 && end === text.length) return null;
	return { start, end };
}

export type Segment<T> = {
	text: string;
	start: number;
	/** Ranges covering this segment. */
	covering: T[];
};

/** Splits text wherever highlight coverage changes. */
export function segmentText<T extends TextRange>(
	text: string,
	ranges: readonly T[],
): Segment<T>[] {
	const usable = ranges.filter(
		(range) =>
			Number.isInteger(range.start) &&
			Number.isInteger(range.end) &&
			range.start >= 0 &&
			range.end <= text.length &&
			range.start < range.end,
	);
	if (usable.length === 0) {
		return text === "" ? [] : [{ text, start: 0, covering: [] }];
	}

	const boundaries = new Set<number>([0, text.length]);
	for (const range of usable) {
		boundaries.add(range.start);
		boundaries.add(range.end);
	}
	const cuts = [...boundaries].sort((a, b) => a - b);

	const segments: Segment<T>[] = [];
	for (let i = 0; i < cuts.length - 1; i++) {
		const start = cuts[i] as number;
		const end = cuts[i + 1] as number;
		if (start === end) continue;
		segments.push({
			text: text.slice(start, end),
			start,
			covering: usable.filter(
				(range) => range.start <= start && range.end >= end,
			),
		});
	}
	return segments;
}

/**
 * Converts the current selection to offsets within `container`.
 * Returns null for an empty or cross-container selection.
 */
export function selectionOffsetsWithin(
	container: HTMLElement,
): TextRange | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return null;
	}
	const range = selection.getRangeAt(0);
	if (
		!container.contains(range.startContainer) ||
		!container.contains(range.endContainer)
	) {
		return null;
	}

	const preceding = document.createRange();
	preceding.selectNodeContents(container);
	preceding.setEnd(range.startContainer, range.startOffset);
	const start = preceding.toString().length;

	return { start, end: start + range.toString().length };
}

/**
 * Returns selected transcript line ids inside `container`.
 * Line ids come from each conversation item's data attribute.
 */
export function selectionLineIdsWithin(container: HTMLElement): string[] | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return null;
	}
	const range = selection.getRangeAt(0);
	if (
		!container.contains(range.startContainer) ||
		!container.contains(range.endContainer)
	) {
		return null;
	}

	const lineIds: string[] = [];
	for (const item of container.querySelectorAll<HTMLElement>(
		"[data-conversation-item]",
	)) {
		const id = item.dataset.conversationItem;
		if (id === undefined) continue;

		// Require overlapping text so an edge-only touch does not select the line.
		const overlap = document.createRange();
		overlap.selectNodeContents(item);
		if (range.compareBoundaryPoints(Range.START_TO_START, overlap) > 0) {
			overlap.setStart(range.startContainer, range.startOffset);
		}
		if (range.compareBoundaryPoints(Range.END_TO_END, overlap) < 0) {
			overlap.setEnd(range.endContainer, range.endOffset);
		}
		if (overlap.toString().trim() !== "") {
			lineIds.push(id);
		}
	}
	return lineIds.length === 0 ? null : lineIds;
}
