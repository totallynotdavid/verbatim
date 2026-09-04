"use client";

import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import * as Input from "@verbatim/ui/input";
import * as Textarea from "@verbatim/ui/textarea";
import { useState } from "react";
import {
	INTERVIEW_DIFFICULTIES,
	INTERVIEW_TOPICS,
	type InterviewDifficulty,
	type InterviewTopic,
	MAX_QUESTION_PROMPT_LENGTH,
	MAX_QUESTION_TAGS,
	parseTags,
} from "@/lib/interview-types";

function ChipGroup<T extends string>({
	legend,
	options,
	value,
	onChange,
}: {
	legend: string;
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (next: T) => void;
}) {
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="mb-1.5 subheading-2xs text-text-soft-400 uppercase">
				{legend}
			</legend>
			<div className="flex flex-wrap gap-1.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						aria-pressed={value === option.value}
						onClick={() => onChange(option.value)}
						className={cn(
							"cursor-pointer rounded-full px-2.5 py-1 label-xs transition duration-200 ease-out",
							"ring-1 ring-inset",
							value === option.value
								? "bg-bg-strong-950 text-text-white-0 ring-transparent"
								: "bg-bg-white-0 text-text-sub-600 ring-stroke-soft-200 hover:bg-bg-weak-50",
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</fieldset>
	);
}

export function QuestionForm({
	initialTopic = "behavioral",
	initialDifficulty = "medium",
	initialPrompt = "",
	initialTags = [],
	submitLabel,
	pending,
	error,
	onSubmit,
	onCancel,
}: {
	initialTopic?: InterviewTopic;
	initialDifficulty?: InterviewDifficulty;
	initialPrompt?: string;
	initialTags?: readonly string[];
	submitLabel: string;
	pending: boolean;
	error: string | null;
	onSubmit: (values: {
		topic: InterviewTopic;
		difficulty: InterviewDifficulty;
		prompt: string;
		tags: string[];
	}) => void;
	onCancel: () => void;
}) {
	const [topic, setTopic] = useState<InterviewTopic>(initialTopic);
	const [difficulty, setDifficulty] =
		useState<InterviewDifficulty>(initialDifficulty);
	const [prompt, setPrompt] = useState(initialPrompt);
	const [tagInput, setTagInput] = useState(initialTags.join(", "));

	const trimmed = prompt.trim();
	const tags = parseTags(tagInput);
	const tooLong = trimmed.length > MAX_QUESTION_PROMPT_LENGTH;
	const tooManyTags = tags.length > MAX_QUESTION_TAGS;
	const canSubmit = trimmed.length > 0 && !tooLong && !tooManyTags && !pending;

	return (
		<form
			className="flex flex-col gap-4 rounded-2xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset"
			onSubmit={(event) => {
				event.preventDefault();
				if (canSubmit) onSubmit({ topic, difficulty, prompt: trimmed, tags });
			}}
		>
			<div className="flex flex-wrap gap-x-8 gap-y-4">
				<ChipGroup
					legend="Topic"
					options={INTERVIEW_TOPICS}
					value={topic}
					onChange={setTopic}
				/>
				<ChipGroup
					legend="Difficulty"
					options={INTERVIEW_DIFFICULTIES}
					value={difficulty}
					onChange={setDifficulty}
				/>
			</div>

			<label className="flex flex-col gap-1.5">
				<span className="subheading-2xs text-text-soft-400 uppercase">
					Question
				</span>
				<Textarea.Root
					value={prompt}
					hasError={tooLong}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder="Ask it the way you would say it out loud in the lesson."
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							if (canSubmit)
								onSubmit({ topic, difficulty, prompt: trimmed, tags });
						}
					}}
				/>
			</label>

			<label className="flex flex-col gap-1.5">
				<span className="subheading-2xs text-text-soft-400 uppercase">
					Tags
				</span>
				<Input.Root
					value={tagInput}
					onChange={(event) => setTagInput(event.target.value)}
					placeholder="comma, separated, labels"
				/>
				<span
					className={cn(
						"paragraph-xs text-text-soft-400",
						tooManyTags && "text-error-base",
					)}
				>
					{tags.length}/{MAX_QUESTION_TAGS} tags
				</span>
			</label>

			{error ? <p className="paragraph-xs text-error-base">{error}</p> : null}

			<div className="flex items-center justify-between gap-2">
				<Textarea.CharCounter
					current={trimmed.length}
					max={MAX_QUESTION_PROMPT_LENGTH}
				/>
				<div className="flex items-center gap-2">
					<Button.Root
						type="button"
						variant="neutral"
						mode="stroke"
						size="xsmall"
						onClick={onCancel}
					>
						Cancel
					</Button.Root>
					<Button.Root type="submit" size="xsmall" disabled={!canSubmit}>
						{pending ? "Saving…" : submitLabel}
					</Button.Root>
				</div>
			</div>
		</form>
	);
}
