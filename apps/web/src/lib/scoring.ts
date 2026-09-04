export type RunStatus =
	| "queued"
	| "transcribing"
	| "scoring"
	| "complete"
	| "failed";

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
	queued: "Starting…",
	transcribing: "Listening to the recording…",
	scoring: "Reading the transcript…",
	complete: "Finished",
	failed: "Did not finish",
};

export function isRunActive(status: RunStatus): boolean {
	return status === "queued" || status === "transcribing" || status === "scoring";
}

/** Describes alignment confidence without presenting it as correctness. */
export function confidenceLabel(confidence: number | null): string {
	if (confidence === null) return "no confidence reported";
	return `${Math.round(confidence * 100)}% clear`;
}

export function scoreColor(score: number): "green" | "yellow" | "orange" {
	if (score >= 80) return "green";
	if (score >= 55) return "yellow";
	return "orange";
}
