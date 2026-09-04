import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { expectedTextFor, reason } from "./model/scoring";

/**
 * Scores saved retry takes with OpenPronounce.
 * The worker answers synchronously, so each take has one summary row and no run.
 */

/** Word errors kept on the row; full detail is stored separately. */
const MAX_SCORED_WORDS = 12;

/** Data needed to score one take, or null if it is not scorable. */
export const target = internalQuery({
	args: {
		retryRecordingId: v.id("retryRecordings"),
	},
	handler: async (ctx, args) => {
		const retry = await ctx.db.get(args.retryRecordingId);
		if (retry === null) return null;
		const annotation = await ctx.db.get(retry.annotationId);
		if (annotation === null) return null;
		const line = await ctx.db.get(annotation.transcriptLineId);
		if (line === null) return null;

		const expectedText = expectedTextFor(annotation, line);
		if (expectedText === null) return null;

		return {
			storageId: retry.storageId,
			annotationId: annotation._id,
			sessionId: annotation.sessionId,
			expectedText,
		};
	},
});

export const begin = internalMutation({
	args: {
		retryRecordingId: v.id("retryRecordings"),
		annotationId: v.id("annotations"),
		sessionId: v.id("lessonSessions"),
		expectedText: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"pronunciationScores"> | null> => {
		// The take may be deleted before the scheduled action runs.
		if ((await ctx.db.get(args.retryRecordingId)) === null) return null;
		const existing = await ctx.db
			.query("pronunciationScores")
			.withIndex("retryRecordingId", (q) =>
				q.eq("retryRecordingId", args.retryRecordingId),
			)
			.unique();
		if (existing !== null) return null;

		return ctx.db.insert("pronunciationScores", {
			...args,
			status: "scoring",
			createdAt: Date.now(),
		});
	},
});

export const save = internalMutation({
	args: {
		scoreId: v.id("pronunciationScores"),
		score: v.optional(v.number()),
		transcript: v.optional(v.string()),
		words: v.optional(
			v.array(
				v.object({
					word: v.string(),
					expected: v.string(),
					heard: v.string(),
					confidence: v.number(),
				}),
			),
		),
		detailStorageId: v.optional(v.id("_storage")),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<void> => {
		const { scoreId, error, ...rest } = args;
		const score = await ctx.db.get(scoreId);
		// Discard results if the take was deleted while scoring.
		if (score === null) {
			if (rest.detailStorageId !== undefined) {
				await ctx.storage.delete(rest.detailStorageId);
			}
			return;
		}
		await ctx.db.patch(scoreId, {
			...rest,
			...(error === undefined
				? { status: "complete" as const }
				: { status: "failed" as const, error }),
			completedAt: Date.now(),
		});
	},
});

/** Extracts word errors from an OpenPronounce response. */
function scoredWords(
	payload: unknown,
): { word: string; expected: string; heard: string; confidence: number }[] {
	const errors = (payload as { differences?: { errors?: unknown } }).differences
		?.errors;
	if (!Array.isArray(errors)) return [];

	return errors
		.flatMap((entry: unknown) => {
			const error = entry as Record<string, unknown>;
			if (typeof error.word !== "string") return [];
			return [
				{
					word: error.word,
					expected: typeof error.expected === "string" ? error.expected : "",
					heard: typeof error.actual === "string" ? error.actual : "",
					// The phone recognizer may omit confidence.
					confidence:
						typeof error.confidence === "number" ? error.confidence : 1,
				},
			];
		})
		.sort((a, b) => b.confidence - a.confidence)
		.slice(0, MAX_SCORED_WORDS);
}

/** Scores one short retry take in one request; an unset URL disables scoring. */
export const score = internalAction({
	args: {
		retryRecordingId: v.id("retryRecordings"),
	},
	handler: async (ctx, args): Promise<void> => {
		const base = process.env.OPENPRONOUNCE_URL;
		if (base === undefined || base === "") return;

		const input = await ctx.runQuery(internal.retryScoring.target, {
			retryRecordingId: args.retryRecordingId,
		});
		if (input === null) return;

		const scoreId = await ctx.runMutation(internal.retryScoring.begin, {
			retryRecordingId: args.retryRecordingId,
			annotationId: input.annotationId,
			sessionId: input.sessionId,
			expectedText: input.expectedText,
		});
		if (scoreId === null) return;

		try {
			const blob = await ctx.storage.get(input.storageId);
			if (blob === null) throw new Error("That take is no longer stored");

			const form = new FormData();
			// The extension identifies the WebM container for ffmpeg.
			form.append("file", blob, "retry.webm");
			form.append("expected_text", input.expectedText);
			// Scoring is English-only.
			form.append("lang", "en");

			const key = process.env.OPENPRONOUNCE_KEY;
			const secret = process.env.OPENPRONOUNCE_SECRET;
			const response = await fetch(
				`${base.replace(/\/+$/, "")}/pronunciation`,
				{
					method: "POST",
					body: form,
					headers:
						// Modal proxy auth gates OpenPronounce, which has no auth of its own.
						key === undefined || secret === undefined
							? {}
							: { "Modal-Key": key, "Modal-Secret": secret },
				},
			);
			if (!response.ok) {
				throw new Error(
					`OpenPronounce answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
				);
			}

			const payload: unknown = await response.json();
			const detail = (payload ?? {}) as Record<string, unknown>;
			// Keep the full response separately; only its summary is rendered.
			const detailStorageId = await ctx.storage.store(
				new Blob([JSON.stringify(payload)], { type: "application/json" }),
			);

			await ctx.runMutation(internal.retryScoring.save, {
				scoreId,
				...(typeof detail.score === "number" ? { score: detail.score } : {}),
				...(typeof detail.transcribe === "string"
					? { transcript: detail.transcribe }
					: {}),
				words: scoredWords(payload),
				detailStorageId,
			});
		} catch (cause) {
			await ctx.runMutation(internal.retryScoring.save, {
				scoreId,
				error: reason(cause, "That take could not be scored"),
			});
		}
	},
});
