/** Types in the order shown in the composer. */
export const ANNOTATION_TYPES = [
	{
		value: "pronunciation",
		label: "Pronunciation",
		color: "purple",
		hint: "A sound, stress or ending that did not land",
	},
	{
		value: "grammar",
		label: "Grammar",
		color: "blue",
		hint: "Tense, agreement, articles",
	},
	{
		value: "word-choice",
		label: "Word choice",
		color: "teal",
		hint: "Understandable, but not what a native speaker would say",
	},
	{
		value: "filler",
		label: "Filler",
		color: "yellow",
		hint: "Um, eh, like, you know",
	},
	{
		value: "interview-structure",
		label: "Interview structure",
		color: "orange",
		hint: "How the answer was framed, not the English",
	},
	{
		value: "technical",
		label: "Technical",
		color: "sky",
		hint: "The engineering content of the answer",
	},
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPES)[number]["value"];

/**
 * The types this app offers a recorded retry on.
 *
 * A retry is an audio comparison of the same phrase said twice, so it only
 * says anything about a correction to *how* something was said. Grammar, word
 * choice, interview structure and technical content are corrections to *what*
 * was said: the fix is conceptual, reading the note is what helps, and a
 * microphone next to it is clutter. Filler belongs with pronunciation because
 * "say that again without the ehm" is a real drill you can hear the result of.
 *
 * This hides the recorder. The backend refuses the write regardless of what
 * the client sends.
 */
const RETRY_TYPES = new Set<string>(["pronunciation", "filler"]);

export function supportsRetry(type: string): boolean {
	return RETRY_TYPES.has(type);
}
export type AnnotationTypeMeta = (typeof ANNOTATION_TYPES)[number];

const BY_VALUE = new Map<string, AnnotationTypeMeta>(
	ANNOTATION_TYPES.map((type) => [type.value, type]),
);

export function annotationType(value: string): AnnotationTypeMeta {
	return BY_VALUE.get(value) ?? ANNOTATION_TYPES[0];
}

/** Static classes let Tailwind include each underline colour. */
export const ANNOTATION_UNDERLINE: Record<AnnotationType, string> = {
	pronunciation: "decoration-feature-base",
	grammar: "decoration-information-base",
	"word-choice": "decoration-stable-base",
	filler: "decoration-away-base",
	"interview-structure": "decoration-warning-base",
	technical: "decoration-verified-base",
};
