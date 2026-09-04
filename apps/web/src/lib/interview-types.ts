/** Labels and rubric types for interview coaching. */

export const INTERVIEW_TOPICS = [
	{ value: "algorithms", label: "Algorithms", color: "blue" },
	{ value: "system-design", label: "System design", color: "purple" },
	{ value: "behavioral", label: "Behavioural", color: "teal" },
	{ value: "fundamentals", label: "Fundamentals", color: "sky" },
] as const;

export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number]["value"];

export const INTERVIEW_DIFFICULTIES = [
	{ value: "easy", label: "Easy", color: "green" },
	{ value: "medium", label: "Medium", color: "yellow" },
	{ value: "hard", label: "Hard", color: "red" },
] as const;

export type InterviewDifficulty =
	(typeof INTERVIEW_DIFFICULTIES)[number]["value"];

/** Rubric dimensions in render order and their stored keys. */
export const RUBRIC_DIMENSIONS = [
	{
		key: "structure",
		label: "Answer structure",
		hint: "Did the answer have a shape: situation, action, result, or did it start in the middle?",
	},
	{
		key: "conciseness",
		label: "Concise framing",
		hint: "Did the first sentence frame the problem, or did it wander before landing?",
	},
	{
		key: "tradeoffs",
		label: "Trade-off discussion",
		hint: "Were the costs of the chosen approach named, not only its benefits?",
	},
	{
		key: "vocabulary",
		label: "Technical vocabulary",
		hint: "The engineering words an interviewer expects, used accurately.",
	},
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number]["key"];

export const RUBRIC_RATINGS = [
	{ value: "strong", label: "Strong", color: "green" },
	{ value: "developing", label: "Developing", color: "yellow" },
	{ value: "needs-work", label: "Needs work", color: "red" },
] as const;

export type RubricRating = (typeof RUBRIC_RATINGS)[number]["value"];

/** Feedback for one rubric dimension, which may be left unassessed. */
export type RubricEntry = { rating?: RubricRating; note?: string };

export const MAX_RUBRIC_NOTE_LENGTH = 1000;
export const MAX_QUESTION_PROMPT_LENGTH = 2000;
export const MAX_QUESTION_TAGS = 8;

/** Falls back to the first option for unknown values. */
export function interviewTopic(value: string) {
	return (
		INTERVIEW_TOPICS.find((topic) => topic.value === value) ??
		INTERVIEW_TOPICS[0]
	);
}

export function interviewDifficulty(value: string) {
	return (
		INTERVIEW_DIFFICULTIES.find((level) => level.value === value) ??
		INTERVIEW_DIFFICULTIES[0]
	);
}

export function rubricRating(value: string) {
	return (
		RUBRIC_RATINGS.find((rating) => rating.value === value) ?? RUBRIC_RATINGS[0]
	);
}

/** Parses comma-separated tags and drops blanks. */
export function parseTags(input: string): string[] {
	return input
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag !== "");
}
