import type { api } from "@verbatim/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type ReviewQueueData = NonNullable<
	FunctionReturnType<typeof api.reviewCards.queue>
>;
export type ReviewCard = ReviewQueueData["cards"][number];
export type RetryRecording = ReviewCard["retries"][number];
