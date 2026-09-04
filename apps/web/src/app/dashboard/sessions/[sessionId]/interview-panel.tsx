"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import * as Popover from "@verbatim/ui/popover";
import { useMutation } from "convex/react";
import { ClipboardList, CornerDownRight, Pencil, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatClock } from "@/lib/clip";
import {
	interviewDifficulty,
	interviewTopic,
	RUBRIC_DIMENSIONS,
	rubricRating,
} from "@/lib/interview-types";
import { QuestionPicker } from "./question-picker";
import { EMPTY_RUBRIC, RubricForm, type RubricValues } from "./rubric-form";
import type { ReviewLine, ReviewSegment } from "./types";

function toFormValues(rubric: ReviewSegment["rubric"]): RubricValues {
	if (rubric === null) return EMPTY_RUBRIC;
	return {
		structure: rubric.structure,
		conciseness: rubric.conciseness,
		tradeoffs: rubric.tradeoffs,
		vocabulary: rubric.vocabulary,
	};
}

function SegmentCard({
	segment,
	lines,
	isTutor,
	onJump,
}: {
	segment: ReviewSegment;
	lines: ReviewLine[];
	isTutor: boolean;
	onJump: (lineId: string) => void;
}) {
	const update = useMutation(api.interviewSegments.update);
	const remove = useMutation(api.interviewSegments.remove);
	const saveRubric = useMutation(api.interviewSegments.saveRubric);
	const removeRubric = useMutation(api.interviewSegments.removeRubric);

	const [retagging, setRetagging] = useState(false);
	const [editingRubric, setEditingRubric] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const inRange = lines.filter(
		(line) => line.order >= segment.startOrder && line.order <= segment.endOrder,
	);
	const first = inRange[0];
	const question = segment.question;
	const topic = question ? interviewTopic(question.topic) : null;
	const difficulty = question ? interviewDifficulty(question.difficulty) : null;

	function report(cause: unknown, fallback: string) {
		setError(cause instanceof Error ? cause.message : fallback);
	}

	return (
		<article className="rounded-2xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex flex-wrap items-center gap-1.5">
						{topic && difficulty ? (
							<>
								<Badge.Root size="medium" variant="lighter" color={topic.color}>
									{topic.label}
								</Badge.Root>
								<Badge.Root
									size="medium"
									variant="lighter"
									color={difficulty.color}
								>
									{difficulty.label}
								</Badge.Root>
							</>
						) : (
							<Badge.Root size="medium" variant="lighter" color="gray">
								Question removed
							</Badge.Root>
						)}
					</div>
					<h3 className="paragraph-sm text-text-strong-950">
						{question?.prompt ?? "This question is no longer in the bank."}
					</h3>
				</div>

				{isTutor ? (
					<div className="flex shrink-0 items-center gap-0.5">
						<Popover.Root open={retagging} onOpenChange={setRetagging}>
							<Popover.Trigger asChild>
								<button
									type="button"
									aria-label="Tag this segment with a different question"
									className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-text-strong-950"
								>
									<Pencil className="size-3.5" />
								</button>
							</Popover.Trigger>
							<Popover.Content align="end" showArrow={false}>
								<QuestionPicker
									title="Retag this segment"
									activeQuestionId={segment.questionId}
									pending={pending}
									error={error}
									onCancel={() => setRetagging(false)}
									onPick={(questionId) => {
										setPending(true);
										setError(null);
										update({ segmentId: segment._id, questionId })
											.then(() => setRetagging(false))
											.catch((cause) => report(cause, "Could not retag that segment"))
											.finally(() => setPending(false));
									}}
								/>
							</Popover.Content>
						</Popover.Root>

						<button
							type="button"
							aria-label="Untag this segment"
							onClick={() => {
								setError(null);
								remove({ segmentId: segment._id }).catch((cause) =>
									report(cause, "Could not untag that segment"),
								);
							}}
							className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-error-base"
						>
							<Trash2 className="size-3.5" />
						</button>
					</div>
				) : null}
			</div>

			<button
				type="button"
				onClick={() => first && onJump(first._id)}
				className="mt-3 w-full cursor-pointer rounded-xl bg-bg-weak-50 px-3 py-2.5 text-left transition-colors hover:bg-bg-soft-200/60"
			>
				<span className="flex items-center gap-1.5 font-mono text-[11px] text-text-soft-400">
					<CornerDownRight className="size-3" />
					{inRange.length} {inRange.length === 1 ? "line" : "lines"}
					{first ? ` · from ${formatClock(first.startMs)}` : null}
				</span>
				<span className="mt-0.5 line-clamp-2 block paragraph-sm text-text-sub-600">
					{first?.text ?? "These lines are no longer in the transcript."}
				</span>
			</button>

			<div className="mt-3 border-stroke-soft-200 border-t pt-3">
				{editingRubric ? (
					<RubricForm
						initial={toFormValues(segment.rubric)}
						pending={pending}
						error={error}
						onCancel={() => setEditingRubric(false)}
						onSubmit={(values) => {
							setPending(true);
							setError(null);
							saveRubric({ segmentId: segment._id, ...values })
								.then(() => setEditingRubric(false))
								.catch((cause) => report(cause, "Could not save that feedback"))
								.finally(() => setPending(false));
						}}
					/>
				) : segment.rubric === null ? (
					<div className="flex items-center justify-between gap-3">
						<p className="paragraph-sm text-text-sub-600">
							No rubric feedback on this answer yet.
						</p>
						{isTutor ? (
							<Button.Root
								size="xxsmall"
								variant="neutral"
								mode="stroke"
								onClick={() => {
									setError(null);
									setEditingRubric(true);
								}}
							>
								<Button.Icon as={ClipboardList} />
								Add feedback
							</Button.Root>
						) : null}
					</div>
				) : (
					<>
						<dl className="flex flex-col gap-2.5">
							{RUBRIC_DIMENSIONS.map((dimension) => {
								const entry = segment.rubric?.[dimension.key];
								const rating =
									entry?.rating === undefined ? null : rubricRating(entry.rating);
								return (
									<div key={dimension.key} className="flex flex-col gap-1">
										<dt className="flex items-center gap-2">
											<span className="label-xs text-text-strong-950">
												{dimension.label}
											</span>
											{rating ? (
												<Badge.Root
													size="small"
													variant="lighter"
													color={rating.color}
												>
													{rating.label}
												</Badge.Root>
											) : null}
										</dt>
										<dd className="whitespace-pre-wrap break-words paragraph-sm text-text-sub-600">
											{entry?.note ??
												(rating ? "" : (
													<span className="text-text-soft-400">Not assessed</span>
												))}
										</dd>
									</div>
								);
							})}
						</dl>

						<div className="mt-3 flex items-center justify-between gap-2">
							<p className="font-mono text-[11px] text-text-soft-400">
								{segment.rubric.authorName ?? "Your tutor"}
							</p>
							{isTutor ? (
								<div className="flex items-center gap-2">
									<Button.Root
										size="xxsmall"
										variant="neutral"
										mode="stroke"
										onClick={() => {
											setError(null);
											setEditingRubric(true);
										}}
									>
										Edit feedback
									</Button.Root>
									<Button.Root
										size="xxsmall"
										variant="neutral"
										mode="ghost"
										onClick={() => {
											setError(null);
											removeRubric({ segmentId: segment._id }).catch((cause) =>
												report(cause, "Could not remove that feedback"),
											);
										}}
									>
										Remove
									</Button.Root>
								</div>
							) : null}
						</div>
					</>
				)}
			</div>

			{error && !editingRubric && !retagging ? (
				<p className="mt-2 paragraph-xs text-error-base">{error}</p>
			) : null}
		</article>
	);
}

export function InterviewPanel({
	segments,
	lines,
	isTutor,
	onJump,
}: {
	segments: ReviewSegment[];
	lines: ReviewLine[];
	isTutor: boolean;
	onJump: (lineId: string) => void;
}) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto p-4">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
				{segments.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-white-0 p-8 text-center ring-1 ring-stroke-soft-200 ring-inset">
						<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
							<Tag className="size-5 text-text-sub-600" />
						</div>
						<h2 className="label-md text-text-strong-950">
							No interview answers tagged
						</h2>
						<p className="max-w-sm paragraph-sm text-text-sub-600">
							{isTutor
								? "On the Transcript tab, select across the lines of an answer to tag them with a question from the bank."
								: "Your tutor has not marked any mock-interview answers in this lesson."}
						</p>
					</div>
				) : (
					segments.map((segment) => (
						<SegmentCard
							key={segment._id}
							segment={segment}
							lines={lines}
							isTutor={isTutor}
							onJump={onJump}
						/>
					))
				)}
			</div>
		</div>
	);
}
