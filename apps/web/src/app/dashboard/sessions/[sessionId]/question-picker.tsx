"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import type { Id } from "@verbatim/backend/convex/_generated/dataModel";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import * as Input from "@verbatim/ui/input";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { interviewDifficulty, interviewTopic } from "@/lib/interview-types";

/** Chooses a question from the bank, optionally filtered by text, topic, or tags. */
export function QuestionPicker({
	title,
	activeQuestionId,
	pending,
	error,
	onPick,
	onCancel,
}: {
	title: string;
	activeQuestionId?: Id<"interviewQuestions"> | null;
	pending: boolean;
	error: string | null;
	onPick: (questionId: Id<"interviewQuestions">) => void;
	onCancel: () => void;
}) {
	const questions = useQuery(api.interviewQuestions.list);
	const [filter, setFilter] = useState("");

	const matches = useMemo(() => {
		const needle = filter.trim().toLowerCase();
		if (needle === "") return questions ?? [];
		return (questions ?? []).filter(
			(question) =>
				question.prompt.toLowerCase().includes(needle) ||
				question.topic.includes(needle) ||
				question.tags.some((tag) => tag.includes(needle)),
		);
	}, [questions, filter]);

	return (
		<div className="flex w-[min(26rem,80vw)] flex-col gap-3">
			<p className="subheading-2xs text-text-soft-400 uppercase">{title}</p>

			{questions === undefined ? (
				<p className="paragraph-sm text-text-sub-600">Loading questions…</p>
			) : questions.length === 0 ? (
				<p className="paragraph-sm text-text-sub-600">
					The question bank is empty.{" "}
					<Link
						href="/dashboard/questions"
						className="text-primary-base underline"
					>
						Add a question
					</Link>{" "}
					first.
				</p>
			) : (
				<>
					<Input.Root
						autoFocus
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						placeholder="Filter by wording, topic or tag"
					/>

					<ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
						{matches.length === 0 ? (
							<li className="paragraph-sm text-text-sub-600">
								No question matches that.
							</li>
						) : (
							matches.map((question) => {
								const topic = interviewTopic(question.topic);
								const difficulty = interviewDifficulty(question.difficulty);
								const isActive = question._id === activeQuestionId;
								return (
									<li key={question._id}>
										<button
											type="button"
											disabled={pending}
											onClick={() => onPick(question._id)}
											className={cn(
												"w-full cursor-pointer rounded-xl px-3 py-2 text-left ring-1 ring-inset transition-colors",
												"disabled:cursor-not-allowed disabled:opacity-60",
												isActive
													? "bg-bg-weak-50 ring-stroke-sub-300"
													: "bg-bg-white-0 ring-stroke-soft-200 hover:bg-bg-weak-50",
											)}
										>
											<span className="flex flex-wrap items-center gap-1.5">
												<Badge.Root
													size="medium"
													variant="lighter"
													color={topic.color}
												>
													{topic.label}
												</Badge.Root>
												<Badge.Root
													size="medium"
													variant="lighter"
													color={difficulty.color}
												>
													{difficulty.label}
												</Badge.Root>
												{isActive ? (
													<span className="paragraph-xs text-text-soft-400">
														current
													</span>
												) : null}
											</span>
											<span className="mt-1 block paragraph-sm text-text-strong-950">
												{question.prompt}
											</span>
										</button>
									</li>
								);
							})
						)}
					</ul>
				</>
			)}

			{error ? <p className="paragraph-xs text-error-base">{error}</p> : null}

			<div className="flex justify-end">
				<Button.Root
					type="button"
					variant="neutral"
					mode="stroke"
					size="xsmall"
					onClick={onCancel}
				>
					Cancel
				</Button.Root>
			</div>
		</div>
	);
}
