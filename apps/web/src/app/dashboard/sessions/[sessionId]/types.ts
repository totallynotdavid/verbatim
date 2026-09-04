import type { api } from "@verbatim/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type ReviewData = NonNullable<
	FunctionReturnType<typeof api.lessonSessions.getReview>
>;
export type ReviewLine = ReviewData["lines"][number];
export type ReviewAnnotation = ReviewData["annotations"][number];
