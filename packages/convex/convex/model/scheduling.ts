/**
 * SM-2 spaced repetition, as published for SuperMemo 2 (Wozniak, 1987) and as
 * implemented by the reference Delphi source at super-memory.com and by the
 * `supermemo` npm package.
 *
 * The algorithm is deliberately unmodified: intervals of 1 day, then 6 days,
 * then `interval * ease`; ease moved by
 * `0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)` after every review and
 * floored at 1.3; a grade below 3 restarts the sequence at one day. The only
 * thing this module adds is the mapping from an interval in days to a `dueAt`
 * timestamp, because cards are stored with an absolute due date.
 */

export const DAY_MS = 86_400_000;

export const INITIAL_EASE = 2.5;

/** Below this, intervals stop growing usefully. */
export const MIN_EASE = 1.3;

/** SM-2 grades. 0-2 are failures, 3-5 are passes. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export const PASS_GRADE = 3;

export type SchedulingState = {
	/** Days between the last review and the next one. 0 for a new card. */
	interval: number;
	ease: number;
	/** Consecutive passes. Reset to 0 by a failure. */
	repetitions: number;
	lapses: number;
};

export type ScheduledState = SchedulingState & { dueAt: number };

/** The state a card starts in: due immediately, so a new note is reviewable today. */
export function newCardState(now: number): ScheduledState {
	return {
		dueAt: now,
		interval: 0,
		ease: INITIAL_EASE,
		repetitions: 0,
		lapses: 0,
	};
}

export function applyReview(
	state: SchedulingState,
	grade: Grade,
	now: number,
): ScheduledState {
	let interval: number;
	let repetitions: number;

	if (grade >= PASS_GRADE) {
		if (state.repetitions === 0) {
			interval = 1;
		} else if (state.repetitions === 1) {
			interval = 6;
		} else {
			// A card that has never been scheduled has interval 0; SM-2 only
			// reaches this branch after 1 and 6, so the multiplier has a base.
			interval = Math.round(Math.max(state.interval, 1) * state.ease);
		}
		repetitions = state.repetitions + 1;
	} else {
		interval = 1;
		repetitions = 0;
	}

	const ease = Math.max(
		MIN_EASE,
		state.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
	);

	return {
		dueAt: now + interval * DAY_MS,
		interval,
		ease,
		repetitions,
		lapses: grade >= PASS_GRADE ? state.lapses : state.lapses + 1,
	};
}
