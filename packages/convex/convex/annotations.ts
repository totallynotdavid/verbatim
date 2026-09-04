import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { createForAnnotation, deleteForAnnotation } from "./model/reviewCards";
import { requireOwnSession } from "./model/sessions";

const MAX_NOTE_LENGTH = 2000;

const annotationType = v.union(
	v.literal("pronunciation"),
	v.literal("grammar"),
	v.literal("word-choice"),
	v.literal("filler"),
	v.literal("interview-structure"),
	v.literal("technical"),
);

function normalizeNote(note: string): string {
	const trimmed = note.trim();
	if (trimmed === "") {
		throw new Error("A note cannot be empty");
	}
	if (trimmed.length > MAX_NOTE_LENGTH) {
		throw new Error(`A note cannot be longer than ${MAX_NOTE_LENGTH} characters`);
	}
	return trimmed;
}

/** Validates and normalizes an optional range in immutable line text. */
function normalizeRange(
	line: Doc<"transcriptLines">,
	charStart: number | undefined,
	charEnd: number | undefined,
): { charStart?: number; charEnd?: number } {
	if (charStart === undefined && charEnd === undefined) {
		return {};
	}
	if (charStart === undefined || charEnd === undefined) {
		throw new Error("A word range needs both charStart and charEnd");
	}
	if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) {
		throw new Error("A word range must use integer character offsets");
	}
	if (charStart < 0 || charEnd > line.text.length || charStart >= charEnd) {
		throw new Error("That word range is outside the transcript line");
	}
	// A range covering the whole line is the same thing as no range at all.
	if (charStart === 0 && charEnd === line.text.length) {
		return {};
	}
	return { charStart, charEnd };
}

async function requireOwnAnnotation(
	ctx: MutationCtx,
	annotationId: Id<"annotations">,
): Promise<Doc<"annotations">> {
	const annotation = await ctx.db.get(annotationId);
	if (annotation === null) {
		throw new Error("Annotation not found");
	}
	// Both participants can read notes. Only the author can edit or remove them.
	const { userId } = await requireOwnSession(ctx, annotation.sessionId);
	if (annotation.authorId !== userId) {
		throw new Error("That note was written by someone else");
	}
	return annotation;
}

export const create = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
		transcriptLineId: v.id("transcriptLines"),
		type: annotationType,
		note: v.string(),
		charStart: v.optional(v.number()),
		charEnd: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { session, userId } = await requireOwnSession(ctx, args.sessionId);

		const line = await ctx.db.get(args.transcriptLineId);
		if (line === null) {
			throw new Error("Transcript line not found");
		}
		if (line.sessionId !== session._id) {
			throw new Error("That transcript line belongs to a different lesson");
		}

		const now = Date.now();
		const annotationId = await ctx.db.insert("annotations", {
			sessionId: session._id,
			transcriptLineId: line._id,
			type: args.type,
			note: normalizeNote(args.note),
			...normalizeRange(line, args.charStart, args.charEnd),
			authorId: userId,
			createdAt: now,
		});

		// One flagged thing is one queue entry, written here rather than by a
		// follow-up call the caller could skip or repeat.
		await createForAnnotation(ctx, { annotationId, session, now });

		return annotationId;
	},
});

/** Updates note content without moving its transcript anchor. */
export const update = mutation({
	args: {
		annotationId: v.id("annotations"),
		type: v.optional(annotationType),
		note: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const annotation = await requireOwnAnnotation(ctx, args.annotationId);

		const patch: { type?: Doc<"annotations">["type"]; note?: string } = {};
		if (args.type !== undefined) {
			patch.type = args.type;
		}
		if (args.note !== undefined) {
			patch.note = normalizeNote(args.note);
		}
		if (Object.keys(patch).length === 0) {
			return annotation._id;
		}

		await ctx.db.patch(annotation._id, patch);
		return annotation._id;
	},
});

export const remove = mutation({
	args: {
		annotationId: v.id("annotations"),
	},
	handler: async (ctx, args) => {
		const annotation = await requireOwnAnnotation(ctx, args.annotationId);
		// The card is derived from the note, so it goes when the note goes.
		await deleteForAnnotation(ctx, annotation._id);
		await ctx.db.delete(annotation._id);
	},
});
