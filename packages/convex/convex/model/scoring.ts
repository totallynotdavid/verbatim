import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Shared contracts and transformations for the two pronunciation workers.
 * WhisperX produces tutor-reviewed lesson drafts; OpenPronounce scores saved
 * retry takes and stores a read-only result.
 */

export const SCORING_CALLBACK_PATH = "/scoring/whisperx";

export const SCORING_AUDIO_PATH = "/scoring/audio";

/** Pinned WhisperX version. Recheck its output shape when updating it. */
export const WHISPERX_VERSION =
	"655845d6190ef70573c669245f245892cd039df4b880a1e3a65852c09252f5cc";

export const REPLICATE_PREDICTIONS_URL =
	"https://api.replicate.com/v1/predictions";

/** Provider timeout that bounds spend on a stalled prediction. */
export const REPLICATE_CANCEL_AFTER = "15m";

/** Gives up on a run whose webhook never arrives. */
export const RUN_TIMEOUT_MS = 30 * 60_000;

/** WhisperX alignment threshold for tutor review, not a pronunciation grade. */
export const LOW_CONFIDENCE = 0.35;

/** Drop short words whose alignment scores are too noisy to review. */
export const MIN_WORD_LENGTH = 2;

/** A run proposes at most this many words, lowest confidence first. */
export const MAX_SUGGESTIONS_PER_RUN = 40;

/** Tolerance for assigning a worker timestamp to a caption line. */
const LINE_MATCH_TOLERANCE_MS = 1_500;

/** Longest expected text sent to OpenPronounce for one retry take. */
export const MAX_EXPECTED_TEXT_LENGTH = 600;

/** Returns a bounded error message for a failed worker call. */
export function reason(cause: unknown, fallback: string): string {
	const message = cause instanceof Error ? cause.message : String(cause);
	return message.trim() === "" ? fallback : message.slice(0, 500);
}

export type RunStatus = Doc<"pronunciationRuns">["status"];

/** Whether a run still expects a worker or callback. */
export function isRunActive(status: RunStatus): boolean {
	return status === "queued" || status === "transcribing" || status === "scoring";
}

/**
 * Derives a per-run token for worker audio and callback routes.
 * `purpose` prevents an audio token from authorizing a callback.
 */
export async function runToken(
	purpose: "audio" | "callback",
	runId: string,
	secret: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${purpose}:${runId}`),
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/** Compares two strings without leaking where they first differ. */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) {
		difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return difference === 0;
}

/** Fields used from one WhisperX aligned word. */
export type AlignedWord = {
	word?: unknown;
	start?: unknown;
	score?: unknown;
};

export type AlignedSegment = {
	words?: unknown;
};

/** Transcript fields needed to map worker timestamps to lines. */
export type LineBounds = {
	_id: Id<"transcriptLines">;
	text: string;
	startMs: number;
	endMs: number;
	speakerId: Id<"users"> | null;
};

export type SuggestionDraft = {
	transcriptLineId: Id<"transcriptLines">;
	word: string;
	confidence: number;
	charStart?: number;
	charEnd?: number;
};

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Strips punctuation attached to a worker word. */
function bareWord(raw: string): string {
	return raw.replace(/^[^\p{L}\p{N}']+/u, "").replace(/[^\p{L}\p{N}']+$/u, "");
}

function escapeForRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds an unused occurrence of a worker word in caption text.
 * Caption and worker transcripts can differ, so a miss stays line-level.
 */
export function locateWord(
	text: string,
	word: string,
	taken: readonly { start: number; end: number }[],
): { start: number; end: number } | null {
	const needle = bareWord(word);
	if (needle === "") return null;

	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}])${escapeForRegExp(needle)}(?![\\p{L}\\p{N}])`,
		"giu",
	);
	let match = pattern.exec(text);
	while (match !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (!taken.some((range) => range.start < end && range.end > start)) {
			return { start, end };
		}
		match = pattern.exec(text);
	}
	return null;
}

/**
 * Chooses the nearest caption line for a worker timestamp.
 * Time is more reliable than matching text. Ambiguous words are dropped rather
 * than assigned across a speaker turn.
 */
export function lineAt(
	lines: readonly LineBounds[],
	sessionMs: number,
): LineBounds | null {
	let best: LineBounds | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		const distance =
			sessionMs >= line.startMs && sessionMs <= line.endMs
				? 0
				: sessionMs < line.startMs
					? line.startMs - sessionMs
					: sessionMs - line.endMs;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = line;
		}
	}
	return bestDistance <= LINE_MATCH_TOLERANCE_MS ? best : null;
}

/**
 * Turns a WhisperX payload into the words worth proposing to a tutor.
 */
export function flagWords({
	segments,
	lines,
	audioOffsetMs,
	studentId,
}: {
	segments: readonly AlignedSegment[];
	lines: readonly LineBounds[];
	/** Offset from session start to the first audio sample. */
	audioOffsetMs: number;
	studentId: Id<"users">;
}): { drafts: SuggestionDraft[]; wordsRead: number } {
	let wordsRead = 0;
	const candidates: { line: LineBounds; word: string; confidence: number }[] = [];

	for (const segment of segments) {
		if (!Array.isArray(segment.words)) continue;
		for (const raw of segment.words as AlignedWord[]) {
			if (typeof raw.word !== "string") continue;
			wordsRead++;
				// An unplaced word is no evidence, not bad evidence.
			if (!isFiniteNumber(raw.start) || !isFiniteNumber(raw.score)) continue;
			const word = bareWord(raw.word);
			if (word.length < MIN_WORD_LENGTH) continue;
			if (raw.score >= LOW_CONFIDENCE) continue;

			const line = lineAt(lines, raw.start * 1000 + audioOffsetMs);
				// Only student-spoken lines produce suggestions.
			if (line === null || line.speakerId !== studentId) continue;
			candidates.push({ line, word, confidence: raw.score });
		}
	}

	// Keep the lowest-confidence words under the cap.
	candidates.sort((a, b) => a.confidence - b.confidence);

	const drafts: SuggestionDraft[] = [];
	const takenByLine = new Map<string, { start: number; end: number }[]>();
	for (const candidate of candidates) {
		if (drafts.length >= MAX_SUGGESTIONS_PER_RUN) break;
		const taken = takenByLine.get(candidate.line._id) ?? [];
		const range = locateWord(candidate.line.text, candidate.word, taken);
		if (range !== null) {
			taken.push(range);
			takenByLine.set(candidate.line._id, taken);
		}
		drafts.push({
			transcriptLineId: candidate.line._id,
			word: candidate.word,
			confidence: candidate.confidence,
			...(range === null ? {} : { charStart: range.start, charEnd: range.end }),
		});
	}
	return { drafts, wordsRead };
}

/** Builds the tutor-editable note stored with a model suggestion. */
export function suggestionNote({
	word,
	confidence,
	anchored,
}: {
	word: string;
	confidence: number;
	anchored: boolean;
}): string {
	const percent = Math.round(confidence * 100);
	return anchored
		? `“${word}” did not come through clearly. Listen back and say what needs work. (Automated flag, model confidence ${percent}%.)`
		: `The recording was unclear around “${word}”. Listen to this line and say what needs work. (Automated flag, model confidence ${percent}%.)`;
}

/**
 * Returns the exact phrase a retry should contain.
 * Anchored notes use the selected span; line-level notes use the whole line.
 */
export function expectedTextFor(
	annotation: Doc<"annotations">,
	line: Doc<"transcriptLines">,
): string | null {
	const raw =
		annotation.charStart === undefined || annotation.charEnd === undefined
			? line.text
			: line.text.slice(annotation.charStart, annotation.charEnd);
	const text = raw.trim();
	if (text === "") return null;
	// Reject phrases too long for a retry.
	if (text.length > MAX_EXPECTED_TEXT_LENGTH) return null;
	return text;
}

/** Deletes a retry's score and its stored detail. */
export async function deleteScoreForRetry(
	ctx: MutationCtx,
	retryRecordingId: Id<"retryRecordings">,
): Promise<void> {
	const score = await ctx.db
		.query("pronunciationScores")
		.withIndex("retryRecordingId", (q) =>
			q.eq("retryRecordingId", retryRecordingId),
		)
		.unique();
	if (score === null) return;
	if (score.detailStorageId !== undefined) {
		await ctx.storage.delete(score.detailStorageId);
	}
	await ctx.db.delete(score._id);
}
