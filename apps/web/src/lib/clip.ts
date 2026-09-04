/** Meet timestamps mark settled caption text, not speech boundaries. */
export const CLIP_PADDING_MS = 250;

export type Clip = {
	start: number;
	end: number;
	/** Whether the unpadded utterance overlaps the recording. */
	available: boolean;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** Maps session timestamps to audio time using the recording offset. */
export function clipWindow({
	startMs,
	endMs,
	offsetMs,
	durationMs,
	paddingMs = CLIP_PADDING_MS,
}: {
	startMs: number;
	endMs: number;
	offsetMs: number;
	/** Session metadata is authoritative for WebM recordings. */
	durationMs: number | null;
	paddingMs?: number;
}): Clip {
	const limit =
		durationMs === null || durationMs <= 0
			? Number.POSITIVE_INFINITY
			: durationMs / 1000;

	const rawStart = (startMs - offsetMs - paddingMs) / 1000;
	const rawEnd = (endMs - offsetMs + paddingMs) / 1000;

	const start = clamp(rawStart, 0, limit);
	const end = clamp(rawEnd, start, limit);

	// Padding alone must not make an out-of-range line playable.
	const available =
		(endMs - offsetMs) / 1000 > 0 && (startMs - offsetMs) / 1000 < limit;

	return { start, end, available };
}

/** Formats timestamps without rounding ahead of the audio. */
export function formatClock(ms: number): string {
	const safe = Math.max(0, Math.floor(ms / 1000));
	const seconds = safe % 60;
	const minutes = Math.floor(safe / 60) % 60;
	const hours = Math.floor(safe / 3600);
	const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
	const ss = String(seconds).padStart(2, "0");
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Formats a session duration for the dashboard list. */
export function formatLength(ms: number | null): string | null {
	if (ms === null || ms <= 0) return null;
	const totalMinutes = Math.round(ms / 60000);
	if (totalMinutes < 1) return "under a minute";
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}
