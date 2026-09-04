/**
 * The four buttons a review ends on, and what each one means to SM-2.
 *
 * SM-2 takes a 0-5 self-rating, which nobody can apply honestly to their own
 * pronunciation. Anki's four-button collapse is the standard fix: one failing
 * button and three passing ones. "Again" maps to 2 rather than 0 because 2 is
 * still inside SM-2's failure band (anything under 3 restarts the card) while
 * costing 0.32 of ease instead of 0.8. A student who cannot yet say a sound
 * the tutor only just flagged is the expected case, not a memory blackout, and
 * two blackouts would otherwise pin the card at the 1.3 ease floor forever.
 */
export const REVIEW_GRADES = [
	{
		grade: 2,
		key: "1",
		label: "Again",
		hint: "Could not say it. Back tomorrow.",
		variant: "error",
	},
	{
		grade: 3,
		key: "2",
		label: "Hard",
		hint: "Got there, but it took work.",
		variant: "neutral",
	},
	{
		grade: 4,
		key: "3",
		label: "Good",
		hint: "Said it with a little hesitation.",
		variant: "primary",
	},
	{
		grade: 5,
		key: "4",
		label: "Easy",
		hint: "Came out clean first time.",
		variant: "success",
	},
] as const;

export type ReviewGrade = (typeof REVIEW_GRADES)[number];
export type GradeValue = ReviewGrade["grade"];

/** Names a stored SM-2 grade, including ones no button can produce. */
export function gradeLabel(grade: number): string {
	const known = REVIEW_GRADES.find((option) => option.grade === grade);
	if (known) return known.label;
	return grade < 3 ? "Again" : "Good";
}

const DAY_MS = 86_400_000;

/** Describes when a card comes back, for the button labels and the card footer. */
export function formatDueIn(dueAt: number, now: number): string {
	const ms = dueAt - now;
	if (ms <= 0) return "now";
	const days = Math.round(ms / DAY_MS);
	if (days < 1) {
		const hours = Math.max(1, Math.round(ms / 3_600_000));
		return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
	}
	if (days === 1) return "tomorrow";
	if (days < 31) return `in ${days} days`;
	const months = Math.round(days / 30);
	return months === 1 ? "in a month" : `in ${months} months`;
}

/** Renders an SM-2 interval, which is a count of days. */
export function formatInterval(days: number): string {
	if (days <= 0) return "new";
	if (days === 1) return "1 day";
	if (days < 31) return `${days} days`;
	const months = Math.round(days / 30);
	return months === 1 ? "1 month" : `${months} months`;
}

/** Renders a length as m:ss. */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
