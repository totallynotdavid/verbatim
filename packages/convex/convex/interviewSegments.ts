import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireSessionTutor } from "./model/sessions";
import { rubricEntry } from "./schema";

/** Tutor-only segment tagging and rubric feedback for lesson interviews. */
const MAX_RUBRIC_NOTE_LENGTH = 1000;

/** Every stored rubric has these four dimensions. */
const RUBRIC_DIMENSIONS = [
	"structure",
	"conciseness",
	"tradeoffs",
	"vocabulary",
] as const;

type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
type RubricEntry = Doc<"interviewRubrics">["structure"];

/** Normalizes blank notes to an unassessed dimension. */
function normalizeEntry(entry: RubricEntry | undefined): RubricEntry {
	if (entry === undefined) return {};
	const trimmed = entry.note?.trim() ?? "";
	if (trimmed.length > MAX_RUBRIC_NOTE_LENGTH) {
		throw new Error(
			`A rubric note cannot be longer than ${MAX_RUBRIC_NOTE_LENGTH} characters`,
		);
	}
	return {
		...(entry.rating === undefined ? {} : { rating: entry.rating }),
		...(trimmed === "" ? {} : { note: trimmed }),
	};
}

function isEmptyEntry(entry: RubricEntry): boolean {
	return entry.rating === undefined && entry.note === undefined;
}

async function requireLineInSession(
	ctx: MutationCtx,
	sessionId: Id<"lessonSessions">,
	lineId: Id<"transcriptLines">,
	which: "first" | "last",
): Promise<Doc<"transcriptLines">> {
	const line = await ctx.db.get(lineId);
	if (line === null) {
		throw new Error(`The ${which} line of that range no longer exists`);
	}
	if (line.sessionId !== sessionId) {
		throw new Error(
			`The ${which} line of that range belongs to a different lesson`,
		);
	}
	return line;
}

/** Rejects overlapping segments because each line belongs to one answer. */
async function requireFreeRange(
	ctx: MutationCtx,
	sessionId: Id<"lessonSessions">,
	startOrder: number,
	endOrder: number,
	ignoreSegmentId?: Id<"interviewSegments">,
): Promise<void> {
	const existing = await ctx.db
		.query("interviewSegments")
		.withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
		.collect();

	const clash = existing.find(
		(segment) =>
			segment._id !== ignoreSegmentId &&
			segment.startOrder <= endOrder &&
			segment.endOrder >= startOrder,
	);
	if (clash !== undefined) {
		throw new Error(
			"Those lines overlap a segment that is already tagged with a question",
		);
	}
}

async function requireEditableSegment(
	ctx: MutationCtx,
	segmentId: Id<"interviewSegments">,
): Promise<{ segment: Doc<"interviewSegments">; userId: Id<"users"> }> {
	const segment = await ctx.db.get(segmentId);
	if (segment === null) {
		throw new Error("Interview segment not found");
	}
	const { userId } = await requireSessionTutor(ctx, segment.sessionId);
	return { segment, userId };
}

async function rubricFor(
	ctx: MutationCtx,
	segmentId: Id<"interviewSegments">,
): Promise<Doc<"interviewRubrics"> | null> {
	return ctx.db
		.query("interviewRubrics")
		.withIndex("segmentId", (q) => q.eq("segmentId", segmentId))
		.unique();
}

export const create = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
		questionId: v.id("interviewQuestions"),
		startLineId: v.id("transcriptLines"),
		endLineId: v.id("transcriptLines"),
	},
	handler: async (ctx, args) => {
		const { session, userId } = await requireSessionTutor(ctx, args.sessionId);

		const question = await ctx.db.get(args.questionId);
		if (question === null) {
			throw new Error("Interview question not found");
		}

		const [first, last] = await Promise.all([
			requireLineInSession(ctx, session._id, args.startLineId, "first"),
			requireLineInSession(ctx, session._id, args.endLineId, "last"),
		]);
		// Accept either bound order from the client.
		const [start, end] =
			first.order <= last.order ? [first, last] : [last, first];

		await requireFreeRange(ctx, session._id, start.order, end.order);

		return ctx.db.insert("interviewSegments", {
			sessionId: session._id,
			questionId: question._id,
			startLineId: start._id,
			endLineId: end._id,
			startOrder: start.order,
			endOrder: end.order,
			createdBy: userId,
			createdAt: Date.now(),
		});
	},
});

/** Retags a segment with a different question, moves its bounds, or both. */
export const update = mutation({
	args: {
		segmentId: v.id("interviewSegments"),
		questionId: v.optional(v.id("interviewQuestions")),
		startLineId: v.optional(v.id("transcriptLines")),
		endLineId: v.optional(v.id("transcriptLines")),
	},
	handler: async (ctx, args) => {
		const { segment } = await requireEditableSegment(ctx, args.segmentId);

		const patch: Partial<Doc<"interviewSegments">> = {};

		if (args.questionId !== undefined) {
			const question = await ctx.db.get(args.questionId);
			if (question === null) {
				throw new Error("Interview question not found");
			}
			patch.questionId = question._id;
		}

		const { startLineId, endLineId } = args;
		if ((startLineId === undefined) !== (endLineId === undefined)) {
			throw new Error("Moving a segment needs both its first and last line");
		}
		if (startLineId !== undefined && endLineId !== undefined) {
			const [first, last] = await Promise.all([
				requireLineInSession(ctx, segment.sessionId, startLineId, "first"),
				requireLineInSession(ctx, segment.sessionId, endLineId, "last"),
			]);
			const [start, end] =
				first.order <= last.order ? [first, last] : [last, first];
			await requireFreeRange(
				ctx,
				segment.sessionId,
				start.order,
				end.order,
				segment._id,
			);
			patch.startLineId = start._id;
			patch.endLineId = end._id;
			patch.startOrder = start.order;
			patch.endOrder = end.order;
		}

		if (Object.keys(patch).length === 0) {
			return segment._id;
		}
		await ctx.db.patch(segment._id, patch);
		return segment._id;
	},
});

export const remove = mutation({
	args: {
		segmentId: v.id("interviewSegments"),
	},
	handler: async (ctx, args) => {
		const { segment } = await requireEditableSegment(ctx, args.segmentId);
		const rubric = await rubricFor(ctx, segment._id);
		if (rubric !== null) {
			await ctx.db.delete(rubric._id);
		}
		await ctx.db.delete(segment._id);
	},
});

/** Replaces all rubric dimensions so cleared feedback is removed. */
export const saveRubric = mutation({
	args: {
		segmentId: v.id("interviewSegments"),
		structure: v.optional(rubricEntry),
		conciseness: v.optional(rubricEntry),
		tradeoffs: v.optional(rubricEntry),
		vocabulary: v.optional(rubricEntry),
	},
	handler: async (ctx, args) => {
		const { segment, userId } = await requireEditableSegment(ctx, args.segmentId);

		const dimensions = {} as Record<RubricDimension, RubricEntry>;
		for (const dimension of RUBRIC_DIMENSIONS) {
			dimensions[dimension] = normalizeEntry(args[dimension]);
		}
		if (RUBRIC_DIMENSIONS.every((name) => isEmptyEntry(dimensions[name]))) {
			throw new Error(
				"Give at least one dimension a rating or a note, or remove the feedback",
			);
		}

		const now = Date.now();
		const existing = await rubricFor(ctx, segment._id);
		if (existing !== null) {
			await ctx.db.patch(existing._id, { ...dimensions, updatedAt: now });
			return existing._id;
		}

		return ctx.db.insert("interviewRubrics", {
			segmentId: segment._id,
			sessionId: segment.sessionId,
			...dimensions,
			authorId: userId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/** Removes rubric feedback without removing the tagged segment. */
export const removeRubric = mutation({
	args: {
		segmentId: v.id("interviewSegments"),
	},
	handler: async (ctx, args) => {
		const { segment } = await requireEditableSegment(ctx, args.segmentId);
		const rubric = await rubricFor(ctx, segment._id);
		if (rubric !== null) {
			await ctx.db.delete(rubric._id);
		}
	},
});
