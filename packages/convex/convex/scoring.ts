import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	type MutationCtx,
} from "./_generated/server";
import { annotationType } from "./annotations";
import { normalizeNote, normalizeRange } from "./model/annotations";
import { createForAnnotation } from "./model/reviewCards";
import {
	flagWords,
	isRunActive,
	MAX_SUGGESTIONS_PER_RUN,
	reason,
	REPLICATE_CANCEL_AFTER,
	REPLICATE_PREDICTIONS_URL,
	RUN_TIMEOUT_MS,
	runToken,
	SCORING_AUDIO_PATH,
	SCORING_CALLBACK_PATH,
	suggestionNote,
	WHISPERX_VERSION,
} from "./model/scoring";
import { requireSessionTutor } from "./model/sessions";

/**
 * Runs lesson-wide pronunciation analysis through Replicate.
 * A mutation records the run, an action submits the job, and the webhook stores
 * the result. Worker output stays in drafts until a tutor confirms it.
 */

const runStatus = v.union(
	v.literal("queued"),
	v.literal("transcribing"),
	v.literal("scoring"),
	v.literal("complete"),
	v.literal("failed"),
);

const draftValidator = v.object({
	transcriptLineId: v.id("transcriptLines"),
	word: v.string(),
	confidence: v.number(),
	charStart: v.optional(v.number()),
	charEnd: v.optional(v.number()),
});

/**
 * Starts a tutor-requested lesson analysis.
 * The run is explicit because it incurs GPU cost and creates tutor-reviewed
 * drafts.
 */
export const start = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args): Promise<Id<"pronunciationRuns">> => {
		const { session, userId } = await requireSessionTutor(ctx, args.sessionId);
		if (session.status !== "ready") {
			throw new Error("Only a finished lesson can be analysed");
		}
		if (session.audioStorageId === undefined) {
			throw new Error("This lesson has no recording to analyse");
		}

		const runs = await ctx.db
			.query("pronunciationRuns")
			.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
			.collect();
		if (runs.some((run) => isRunActive(run.status))) {
			throw new Error("An analysis of this lesson is already running");
		}

		const runId = await ctx.db.insert("pronunciationRuns", {
			sessionId: session._id,
			requestedBy: userId,
			requestedAt: Date.now(),
			status: "queued",
		});

		// Schedule both jobs from the mutation so rollback schedules neither.
		await ctx.scheduler.runAfter(0, internal.scoring.submitWhisperx, { runId });
		// Expire runs whose webhook never arrives.
		await ctx.scheduler.runAfter(RUN_TIMEOUT_MS, internal.scoring.expireRun, {
			runId,
		});
		return runId;
	},
});

/** Gives up on a run, and stops paying for it if it has already been handed over. */
export const cancel = mutation({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (run === null) {
			throw new Error("Analysis run not found");
		}
		await requireSessionTutor(ctx, run.sessionId);
		if (!isRunActive(run.status)) {
			return run.status;
		}

		await ctx.db.patch(run._id, {
			status: "failed",
			error: "Canceled",
			completedAt: Date.now(),
		});
		if (run.predictionId !== undefined) {
			await ctx.scheduler.runAfter(0, internal.scoring.cancelPrediction, {
				predictionId: run.predictionId,
			});
		}
		return "failed" as const;
	},
});

async function requirePendingSuggestion(
	ctx: MutationCtx,
	suggestionId: Id<"pronunciationSuggestions">,
): Promise<{
	suggestion: Doc<"pronunciationSuggestions">;
	session: Doc<"lessonSessions">;
	userId: Id<"users">;
}> {
	const suggestion = await ctx.db.get(suggestionId);
	if (suggestion === null) {
		throw new Error("Suggestion not found");
	}
	// Suggestions are tutor-only.
	const { session, userId } = await requireSessionTutor(ctx, suggestion.sessionId);
	if (suggestion.status !== "pending") {
		throw new Error("That suggestion has already been dealt with");
	}
	return { suggestion, session, userId };
}

/** Copies a tutor-confirmed draft into `annotations` and its review card. */
export const confirmSuggestion = mutation({
	args: {
		suggestionId: v.id("pronunciationSuggestions"),
		// The tutor may rewrite the draft note, and retype it, before confirming.
		note: v.optional(v.string()),
		type: v.optional(annotationType),
	},
	handler: async (ctx, args): Promise<Id<"annotations">> => {
		const { suggestion, session, userId } = await requirePendingSuggestion(
			ctx,
			args.suggestionId,
		);

		const line = await ctx.db.get(suggestion.transcriptLineId);
		if (line === null) {
			throw new Error("That suggestion's transcript line no longer exists");
		}
		if (line.sessionId !== session._id) {
			throw new Error("That transcript line belongs to a different lesson");
		}

		const now = Date.now();
		const annotationId = await ctx.db.insert("annotations", {
			sessionId: session._id,
			transcriptLineId: line._id,
			type: args.type ?? "pronunciation",
			note: normalizeNote(args.note ?? suggestion.note),
			...normalizeRange(line, suggestion.charStart, suggestion.charEnd),
		// The confirming tutor owns the note.
			authorId: userId,
			createdAt: now,
			source: "auto",
		});
		await createForAnnotation(ctx, { annotationId, session, now });

		await ctx.db.patch(suggestion._id, {
			status: "confirmed",
			annotationId,
			reviewedBy: userId,
			reviewedAt: now,
		});
		return annotationId;
	},
});

/** Dismisses a draft and keeps it for deduplication. */
export const dismissSuggestion = mutation({
	args: {
		suggestionId: v.id("pronunciationSuggestions"),
	},
	handler: async (ctx, args) => {
		const { suggestion, userId } = await requirePendingSuggestion(
			ctx,
			args.suggestionId,
		);
		await ctx.db.patch(suggestion._id, {
			status: "dismissed",
			reviewedBy: userId,
			reviewedAt: Date.now(),
		});
	},
});

/** Updates an active run; terminal runs ignore late callbacks and expiry jobs. */
export const patchRun = internalMutation({
	args: {
		runId: v.id("pronunciationRuns"),
		status: runStatus,
		predictionId: v.optional(v.string()),
		error: v.optional(v.string()),
		wordsRead: v.optional(v.number()),
		suggestionsCreated: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const run = await ctx.db.get(args.runId);
		if (run === null || !isRunActive(run.status)) return false;

		const { runId, status, ...rest } = args;
		await ctx.db.patch(runId, {
			status,
			...rest,
			...(isRunActive(status) ? {} : { completedAt: Date.now() }),
		});
		return true;
	},
});

export const runStatusFor = internalQuery({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		return run === null ? null : { status: run.status };
	},
});

/** Gives Replicate a revocable URL for the lesson recording and returns. */
export const submitWhisperx = internalAction({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args): Promise<void> => {
		const current = await ctx.runQuery(internal.scoring.runStatusFor, {
			runId: args.runId,
		});
		if (current === null || current.status !== "queued") return;

		const fail = (error: string) =>
			ctx.runMutation(internal.scoring.patchRun, {
				runId: args.runId,
				status: "failed",
				error,
			});

		const token = process.env.REPLICATE_API_TOKEN;
		const secret = process.env.SCORING_CALLBACK_SECRET;
		const site = process.env.CONVEX_SITE_URL;
		if (token === undefined || token === "") {
			await fail("REPLICATE_API_TOKEN is not set on this deployment");
			return;
		}
		if (secret === undefined || secret === "") {
			await fail("SCORING_CALLBACK_SECRET is not set on this deployment");
			return;
		}
		if (site === undefined || site === "") {
			await fail("CONVEX_SITE_URL is not set on this deployment");
			return;
		}

		const [audioToken, callbackToken] = await Promise.all([
			runToken("audio", args.runId, secret),
			runToken("callback", args.runId, secret),
		]);
		const audioUrl = `${site}${SCORING_AUDIO_PATH}?run=${args.runId}&token=${audioToken}`;
		const webhook = `${site}${SCORING_CALLBACK_PATH}?run=${args.runId}&token=${callbackToken}`;

		// Claim before calling Replicate because it may fetch the URL immediately.
		const claimed = await ctx.runMutation(internal.scoring.patchRun, {
			runId: args.runId,
			status: "transcribing",
		});
		if (!claimed) return;

		let response: Response;
		try {
			response = await fetch(REPLICATE_PREDICTIONS_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					// Bound spend if the prediction wedges.
					"Cancel-After": REPLICATE_CANCEL_AFTER,
				},
				body: JSON.stringify({
					version: WHISPERX_VERSION,
					input: {
						audio_file: audioUrl,
						// Scoring is English-only.
						language: "en",
						// Required for word-level scores.
						align_output: true,
						// Meet captions already identify the two speakers.
						diarization: false,
					},
					webhook,
					// Process only final output.
					webhook_events_filter: ["completed"],
				}),
			});
		} catch (cause) {
			await fail(reason(cause, "Could not reach Replicate"));
			return;
		}

		const body = await response.text();
		if (!response.ok) {
			await fail(`Replicate refused the job (${response.status}): ${body.slice(0, 300)}`);
			return;
		}

		let predictionId: string | undefined;
		try {
			const parsed: unknown = JSON.parse(body);
			const id = (parsed as { id?: unknown }).id;
			if (typeof id === "string") predictionId = id;
		} catch {
			// The job was accepted without a usable id; expiry still bounds it.
		}
		if (predictionId === undefined) return;

		const stillOurs = await ctx.runMutation(internal.scoring.patchRun, {
			runId: args.runId,
			status: "transcribing",
			predictionId,
		});
	// Cancel if the tutor won the race after the initial claim.
		if (!stillOurs) {
			await ctx.runAction(internal.scoring.cancelPrediction, { predictionId });
		}
	},
});

/** Best-effort provider cancellation; the provider timeout is the fallback. */
export const cancelPrediction = internalAction({
	args: {
		predictionId: v.string(),
	},
	handler: async (_ctx, args): Promise<void> => {
		const token = process.env.REPLICATE_API_TOKEN;
		if (token === undefined || token === "") return;
		try {
			await fetch(`${REPLICATE_PREDICTIONS_URL}/${args.predictionId}/cancel`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
		} catch {
			// The provider timeout still bounds spend.
		}
	},
});

/** Fails an active run whose callback never arrives. */
export const expireRun = internalMutation({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args): Promise<void> => {
		const run = await ctx.db.get(args.runId);
		if (run === null || !isRunActive(run.status)) return;

		await ctx.db.patch(run._id, {
			status: "failed",
			error: `The analysis did not report back within ${RUN_TIMEOUT_MS / 60_000} minutes`,
			completedAt: Date.now(),
		});
		if (run.predictionId !== undefined) {
			await ctx.scheduler.runAfter(0, internal.scoring.cancelPrediction, {
				predictionId: run.predictionId,
			});
		}
	},
});

/** Resolves a worker URL id; malformed ids return null. */
export const runForWorker = internalQuery({
	args: {
		runId: v.string(),
	},
	handler: async (ctx, args) => {
		const runId: Id<"pronunciationRuns"> | null = ctx.db.normalizeId(
			"pronunciationRuns",
			args.runId,
		);
		if (runId === null) return null;
		const run = await ctx.db.get(runId);
		return run === null ? null : { _id: run._id, status: run.status };
	},
});

/** Returns lesson audio only while its run is active. */
export const runAudioTarget = internalQuery({
	args: {
		runId: v.string(),
	},
	handler: async (ctx, args) => {
		const runId: Id<"pronunciationRuns"> | null = ctx.db.normalizeId(
			"pronunciationRuns",
			args.runId,
		);
		if (runId === null) return null;
		const run = await ctx.db.get(runId);
		if (run === null || !isRunActive(run.status)) return null;

		const session = await ctx.db.get(run.sessionId);
		if (session === null || session.audioStorageId === undefined) return null;

		const metadata = await ctx.db.system.get(session.audioStorageId);
		return {
			storageId: session.audioStorageId,
			contentType: metadata?.contentType ?? null,
		};
	},
});

/** Accepts one final result and ignores duplicate or late deliveries. */
export const acceptResult = internalMutation({
	args: {
		runId: v.id("pronunciationRuns"),
		storageId: v.id("_storage"),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const run = await ctx.db.get(args.runId);
		// Drop repeat deliveries and results for timed-out runs.
		if (run === null || run.status !== "transcribing") {
			await ctx.storage.delete(args.storageId);
			return false;
		}
		await ctx.db.patch(run._id, {
			status: "scoring",
			resultStorageId: args.storageId,
		});
		await ctx.scheduler.runAfter(0, internal.scoring.buildSuggestions, {
			runId: run._id,
		});
		return true;
	},
});

export const suggestionContext = internalQuery({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (run === null || run.resultStorageId === undefined) return null;
		const session = await ctx.db.get(run.sessionId);
		if (session === null) return null;

		const lines = await ctx.db
			.query("transcriptLines")
			.withIndex("sessionId_order", (q) => q.eq("sessionId", session._id))
			.collect();

		return {
			resultStorageId: run.resultStorageId,
			studentId: session.studentId,
			audioOffsetMs: session.audioOffsetMs ?? 0,
			lines: lines.map((line) => ({
				_id: line._id,
				text: line.text,
				startMs: line.startMs,
				endMs: line.endMs,
				speakerId: line.speakerId ?? null,
			})),
		};
	},
});

export const buildSuggestions = internalAction({
	args: {
		runId: v.id("pronunciationRuns"),
	},
	handler: async (ctx, args): Promise<void> => {
		const fail = (error: string) =>
			ctx.runMutation(internal.scoring.patchRun, {
				runId: args.runId,
				status: "failed",
				error,
			});

		const context = await ctx.runQuery(internal.scoring.suggestionContext, {
			runId: args.runId,
		});
		if (context === null) {
			await fail("The analysis result went missing before it could be read");
			return;
		}

		let segments: unknown;
		try {
			const blob = await ctx.storage.get(context.resultStorageId);
			if (blob === null) throw new Error("stored result not found");
			const payload: unknown = JSON.parse(await blob.text());
			segments = (payload as { segments?: unknown }).segments;
		} catch (cause) {
			await fail(reason(cause, "The analysis result could not be read"));
			return;
		}
		if (!Array.isArray(segments)) {
			await fail("The analysis returned no aligned segments");
			return;
		}

		const { drafts, wordsRead } = flagWords({
			segments,
			lines: context.lines,
			audioOffsetMs: context.audioOffsetMs,
			studentId: context.studentId,
		});

		await ctx.runMutation(internal.scoring.saveSuggestions, {
			runId: args.runId,
			wordsRead,
			drafts,
		});
	},
});

/** Returns the deduplication key for a transcript span. */
function spanKey(
	transcriptLineId: Id<"transcriptLines">,
	charStart: number | undefined,
	charEnd: number | undefined,
): string {
	return charStart === undefined || charEnd === undefined
		? `${transcriptLineId}:line`
		: `${transcriptLineId}:${charStart}:${charEnd}`;
}

export const saveSuggestions = internalMutation({
	args: {
		runId: v.id("pronunciationRuns"),
		wordsRead: v.number(),
		drafts: v.array(draftValidator),
	},
	handler: async (ctx, args): Promise<void> => {
		const run = await ctx.db.get(args.runId);
		if (run === null || run.status !== "scoring") return;

		const [existing, annotations] = await Promise.all([
			ctx.db
				.query("pronunciationSuggestions")
				.withIndex("sessionId", (q) => q.eq("sessionId", run.sessionId))
				.collect(),
			ctx.db
				.query("annotations")
				.withIndex("sessionId", (q) => q.eq("sessionId", run.sessionId))
				.collect(),
		]);

		// Existing suggestions and notes block the same span on reruns.
		const seen = new Set([
			...existing.map((suggestion) =>
				spanKey(
					suggestion.transcriptLineId,
					suggestion.charStart,
					suggestion.charEnd,
				),
			),
			...annotations.map((annotation) =>
				spanKey(
					annotation.transcriptLineId,
					annotation.charStart,
					annotation.charEnd,
				),
			),
		]);

		const now = Date.now();
		let created = 0;
		for (const draft of args.drafts) {
			if (created >= MAX_SUGGESTIONS_PER_RUN) break;
			const line = await ctx.db.get(draft.transcriptLineId);
			if (line === null || line.sessionId !== run.sessionId) continue;

			// Normalize before deduplication because whole-line ranges omit offsets.
			const range = normalizeRange(line, draft.charStart, draft.charEnd);
			const key = spanKey(line._id, range.charStart, range.charEnd);
			if (seen.has(key)) continue;

			seen.add(key);
			await ctx.db.insert("pronunciationSuggestions", {
				sessionId: run.sessionId,
				runId: run._id,
				transcriptLineId: line._id,
				worker: "whisperx",
				note: suggestionNote({
					word: draft.word,
					confidence: draft.confidence,
					anchored: range.charStart !== undefined,
				}),
				...range,
				confidence: draft.confidence,
				status: "pending",
				createdAt: now,
			});
			created++;
		}

		await ctx.db.patch(run._id, {
			status: "complete",
			wordsRead: args.wordsRead,
			suggestionsCreated: created,
			completedAt: now,
		});
	},
});
