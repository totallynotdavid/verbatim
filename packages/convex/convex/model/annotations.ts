import type { Doc } from "../_generated/dataModel";

/** Validation shared by typed and model-confirmed annotations. */

export const MAX_NOTE_LENGTH = 2000;

export function normalizeNote(note: string): string {
	const trimmed = note.trim();
	if (trimmed === "") {
		throw new Error("A note cannot be empty");
	}
	if (trimmed.length > MAX_NOTE_LENGTH) {
		throw new Error(`A note cannot be longer than ${MAX_NOTE_LENGTH} characters`);
	}
	return trimmed;
}

/** Validates an optional range and omits whole-line ranges. */
export function normalizeRange(
	line: Doc<"transcriptLines">,
	charStart: number | undefined,
	charEnd: number | undefined,
): { charStart?: number; charEnd?: number } {
	if (charStart === undefined && charEnd === undefined) {
		return {};
	}
	if (charStart === undefined || charEnd === undefined) {
		throw new Error("A word range needs both charStart and charEnd");
	}
	if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) {
		throw new Error("A word range must use integer character offsets");
	}
	if (charStart < 0 || charEnd > line.text.length || charStart >= charEnd) {
		throw new Error("That word range is outside the transcript line");
	}
	// A range covering the whole line is the same thing as no range at all.
	if (charStart === 0 && charEnd === line.text.length) {
		return {};
	}
	return { charStart, charEnd };
}
