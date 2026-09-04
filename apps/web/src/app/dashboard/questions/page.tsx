"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import type { Id } from "@verbatim/backend/convex/_generated/dataModel";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import { useMutation, useQuery } from "convex/react";
import { MessageCircleQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	interviewDifficulty,
	interviewTopic,
	type InterviewDifficulty,
	type InterviewTopic,
} from "@/lib/interview-types";
import { QuestionForm } from "./question-form";

type QuestionId = Id<"interviewQuestions">;

export default function QuestionsPage() {
	const viewer = useQuery(api.users.viewer);
	const questions = useQuery(api.interviewQuestions.list);
	const create = useMutation(api.interviewQuestions.create);
	const update = useMutation(api.interviewQuestions.update);
	const remove = useMutation(api.interviewQuestions.remove);

	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<QuestionId | null>(null);
	const [pending, setPending] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [rowError, setRowError] = useState<{
		id: QuestionId;
		message: string;
	} | null>(null);

	// UI visibility is convenience. The backend enforces tutor-only writes.
	const isTutor = viewer?.role === "tutor";

	function submit(
		values: {
			topic: InterviewTopic;
			difficulty: InterviewDifficulty;
			prompt: string;
			tags: string[];
		},
		questionId: QuestionId | null,
	) {
		setPending(true);
		setFormError(null);
		const write =
			questionId === null
				? create(values)
				: update({ questionId, ...values });
		write
			.then(() => {
				setCreating(false);
				setEditingId(null);
			})
			.catch((cause: unknown) =>
				setFormError(
					cause instanceof Error ? cause.message : "Could not save that question",
				),
			)
			.finally(() => setPending(false));
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex h-11 shrink-0 items-center justify-between gap-3 border-stroke-soft-200 border-b px-6 dark:border-white/10">
				<h1 className="label-sm text-text-strong-950">Interview questions</h1>
				{isTutor && !creating ? (
					<Button.Root
						size="xxsmall"
						onClick={() => {
							setCreating(true);
							setEditingId(null);
							setFormError(null);
						}}
					>
						<Button.Icon as={Plus} />
						New question
					</Button.Root>
				) : null}
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto p-6">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
					<p className="paragraph-sm text-text-sub-600">
						The prompts asked during the mock-interview part of a lesson. Tag a
						run of transcript lines with one of these on a lesson page, then
						score the answer against the rubric.
						{isTutor ? null : " Only your tutor can change this list."}
					</p>

					{creating ? (
						<QuestionForm
							submitLabel="Add question"
							pending={pending}
							error={formError}
							onCancel={() => setCreating(false)}
							onSubmit={(values) => submit(values, null)}
						/>
					) : null}

					{questions === undefined ? (
						<p className="paragraph-sm text-text-sub-600">Loading…</p>
					) : questions.length === 0 && !creating ? (
						<div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-white-0 p-8 text-center ring-1 ring-stroke-soft-200 ring-inset">
							<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
								<MessageCircleQuestion className="size-5 text-text-sub-600" />
							</div>
							<h2 className="label-md text-text-strong-950">
								No questions yet
							</h2>
							<p className="max-w-sm paragraph-sm text-text-sub-600">
								{isTutor
									? "Add the questions you ask in mock interviews so lesson segments can point at them."
									: "Your tutor has not added any interview questions yet."}
							</p>
						</div>
					) : (
						<ul className="flex flex-col gap-2">
							{questions.map((question) => {
								const topic = interviewTopic(question.topic);
								const difficulty = interviewDifficulty(question.difficulty);

								if (editingId === question._id) {
									return (
										<li key={question._id}>
											<QuestionForm
												initialTopic={question.topic}
												initialDifficulty={question.difficulty}
												initialPrompt={question.prompt}
												initialTags={question.tags}
												submitLabel="Save"
												pending={pending}
												error={formError}
												onCancel={() => setEditingId(null)}
												onSubmit={(values) => submit(values, question._id)}
											/>
										</li>
									);
								}

								return (
									<li
										key={question._id}
										className="rounded-xl bg-bg-white-0 px-4 py-3.5 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset"
									>
										<div className="flex items-start gap-2">
											<div className="flex min-w-0 flex-1 flex-col gap-1.5">
												<div className="flex flex-wrap items-center gap-1.5">
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
													{question.tags.map((tag) => (
														<span
															key={tag}
															className="rounded-full bg-bg-weak-50 px-2 py-0.5 label-xs text-text-sub-600"
														>
															{tag}
														</span>
													))}
												</div>
												<p className="whitespace-pre-wrap break-words paragraph-sm text-text-strong-950">
													{question.prompt}
												</p>
												<p className="paragraph-xs text-text-soft-400">
													{question.usageCount === 0
														? "Not used in a lesson yet"
														: `Tagged on ${question.usageCount} lesson ${
																question.usageCount === 1
																	? "segment"
																	: "segments"
															}`}
												</p>
											</div>

											{isTutor ? (
												<div className="flex shrink-0 items-center gap-0.5">
													<button
														type="button"
														aria-label="Edit this question"
														onClick={() => {
															setEditingId(question._id);
															setCreating(false);
															setFormError(null);
															setRowError(null);
														}}
														className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-text-strong-950"
													>
														<Pencil className="size-3.5" />
													</button>
													<button
														type="button"
														aria-label="Delete this question"
														onClick={() => {
															setRowError(null);
															remove({ questionId: question._id }).catch(
																(cause: unknown) =>
																	setRowError({
																		id: question._id,
																		message:
																			cause instanceof Error
																				? cause.message
																				: "Could not delete that question",
																	}),
															);
														}}
														className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-error-base"
													>
														<Trash2 className="size-3.5" />
													</button>
												</div>
											) : null}
										</div>

										{rowError?.id === question._id ? (
											<p className="mt-2 paragraph-xs text-error-base">
												{rowError.message}
											</p>
										) : null}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
