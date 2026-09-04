"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import type { Id } from "@verbatim/backend/convex/_generated/dataModel";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import * as Popover from "@verbatim/ui/popover";
import { useMutation } from "convex/react";
import {
	Check,
	CornerDownRight,
	Pencil,
	Sparkles,
	Wand2,
	X,
} from "lucide-react";
import { useState } from "react";
import { formatClock } from "@/lib/clip";
import { confidenceLabel, isRunActive, RUN_STATUS_LABEL } from "@/lib/scoring";
import { AnnotationForm } from "./annotation-form";
import type { ReviewAnalysis, ReviewLine, ReviewSuggestion } from "./types";

const RUN_TIME = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

function errorMessage(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

function RunCard({
	sessionId,
	analysis,
	hasAudio,
	canRun,
}: {
	sessionId: Id<"lessonSessions">;
	analysis: ReviewAnalysis;
	hasAudio: boolean;
	/** Whether the lesson is finished and has audio. */
	canRun: boolean;
}) {
	const start = useMutation(api.scoring.start);
	const cancel = useMutation(api.scoring.cancel);

	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = analysis.run;
	const running = run !== null && isRunActive(run.status);

	return (
		<section className="rounded-2xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="flex items-center gap-1.5 label-sm text-text-strong-950">
						<Sparkles className="size-4 text-text-soft-400" />
						Automated pronunciation pass
					</h2>
					<p className="max-w-md paragraph-xs text-text-sub-600">
						Listens to the recording and proposes words the student said unclearly.
						Every result is a draft until you confirm it. Each pass costs money, so
						it runs when you ask for it and not before.
					</p>
				</div>

				{running ? (
					<Button.Root
						size="xxsmall"
						variant="neutral"
						mode="stroke"
						disabled={pending}
						onClick={() => {
							if (run === null) return;
							setPending(true);
							setError(null);
							cancel({ runId: run._id })
								.catch((cause) =>
									setError(errorMessage(cause, "Could not cancel that run")),
								)
								.finally(() => setPending(false));
						}}
					>
						Cancel
					</Button.Root>
				) : (
					<Button.Root
						size="xxsmall"
						disabled={pending || !canRun}
						onClick={() => {
							setPending(true);
							setError(null);
							start({ sessionId })
								.catch((cause) =>
									setError(errorMessage(cause, "Could not start that analysis")),
								)
								.finally(() => setPending(false));
						}}
					>
						<Button.Icon as={Wand2} />
						{run === null ? "Analyse this lesson" : "Analyse again"}
					</Button.Root>
				)}
			</div>

			{!canRun ? (
				<p className="mt-3 border-stroke-soft-200 border-t pt-3 paragraph-xs text-text-sub-600">
					{hasAudio
						? "This lesson has to be finished before it can be analysed."
						: "This lesson has no recording, so there is nothing to listen to."}
				</p>
			) : run === null ? null : (
				<dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-stroke-soft-200 border-t pt-3 paragraph-xs text-text-sub-600">
					<div className="flex items-center gap-1.5">
						<dt className="text-text-soft-400">Last pass</dt>
						<dd className="font-mono text-text-strong-950">
							{RUN_TIME.format(new Date(run.requestedAt))}
						</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<dt className="text-text-soft-400">State</dt>
						<dd>{RUN_STATUS_LABEL[run.status]}</dd>
					</div>
					{run.status === "complete" ? (
						<div className="flex items-center gap-1.5">
							<dt className="text-text-soft-400">Proposed</dt>
							<dd className="font-mono text-text-strong-950">
								{run.suggestionsCreated ?? 0}
							</dd>
							{run.wordsRead === null ? null : (
								<dd className="text-text-soft-400">
									of {run.wordsRead} words heard
								</dd>
							)}
						</div>
					) : null}
				</dl>
			)}

			{run?.error ? (
				<p className="mt-2 paragraph-xs text-error-base">{run.error}</p>
			) : null}
			{error ? <p className="mt-2 paragraph-xs text-error-base">{error}</p> : null}

			{analysis.confirmedCount + analysis.dismissedCount > 0 ? (
				<p className="mt-2 font-mono text-[11px] text-text-soft-400">
					{analysis.confirmedCount} confirmed · {analysis.dismissedCount} dismissed
					{" · already-answered words are not proposed again"}
				</p>
			) : null}
		</section>
	);
}

function SuggestionCard({
	suggestion,
	line,
	onJump,
}: {
	suggestion: ReviewSuggestion;
	line: ReviewLine | undefined;
	onJump: (lineId: string) => void;
}) {
	const confirm = useMutation(api.scoring.confirmSuggestion);
	const dismiss = useMutation(api.scoring.dismissSuggestion);

	const [editing, setEditing] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const quote =
		line && suggestion.charStart !== null && suggestion.charEnd !== null
			? line.text.slice(suggestion.charStart, suggestion.charEnd)
			: null;

	function runAction(work: Promise<unknown>, fallback: string) {
		setPending(true);
		setError(null);
		work
			.then(() => setEditing(false))
			.catch((cause) => setError(errorMessage(cause, fallback)))
			.finally(() => setPending(false));
	}

	return (
		<article className="rounded-2xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex flex-wrap items-center gap-1.5">
				<Badge.Root size="medium" variant="lighter" color="purple">
					Pronunciation
				</Badge.Root>
				<Badge.Root size="medium" variant="lighter" color="gray">
					Suggested
				</Badge.Root>
				<span className="font-mono text-[11px] text-text-soft-400">
					{confidenceLabel(suggestion.confidence)}
				</span>
			</div>

			{quote ? (
				<p className="mt-2 paragraph-sm text-text-sub-600">
					“<span className="text-text-strong-950">{quote}</span>”
				</p>
			) : null}

			<p className="mt-1.5 whitespace-pre-wrap break-words paragraph-sm text-text-strong-950">
				{suggestion.note}
			</p>

			{line ? (
				<button
					type="button"
					onClick={() => onJump(line._id)}
					className="mt-3 w-full cursor-pointer rounded-xl bg-bg-weak-50 px-3 py-2.5 text-left transition-colors hover:bg-bg-soft-200/60"
				>
					<span className="flex items-center gap-1.5 font-mono text-[11px] text-text-soft-400">
						<CornerDownRight className="size-3" />
						{line.speakerName ?? "Unknown speaker"} · {formatClock(line.startMs)}
					</span>
					<span className="mt-0.5 line-clamp-2 block paragraph-sm text-text-sub-600">
						{line.text}
					</span>
				</button>
			) : null}

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Button.Root
					size="xxsmall"
					disabled={pending}
					onClick={() =>
						runAction(
							confirm({ suggestionId: suggestion._id }),
							"Could not confirm that suggestion",
						)
					}
				>
					<Button.Icon as={Check} />
					Confirm as a note
				</Button.Root>

				<Popover.Root open={editing} onOpenChange={setEditing}>
					<Popover.Trigger asChild>
						<Button.Root size="xxsmall" variant="neutral" mode="stroke">
							<Button.Icon as={Pencil} />
							Edit first
						</Button.Root>
					</Popover.Trigger>
					<Popover.Content align="start" showArrow={false}>
						<AnnotationForm
							initialNote={suggestion.note}
							quote={quote}
							submitLabel="Confirm"
							pending={pending}
							error={error}
							onCancel={() => setEditing(false)}
							onSubmit={({ type, note }) =>
								runAction(
									confirm({ suggestionId: suggestion._id, type, note }),
									"Could not confirm that suggestion",
								)
							}
						/>
					</Popover.Content>
				</Popover.Root>

				<Button.Root
					size="xxsmall"
					variant="neutral"
					mode="ghost"
					disabled={pending}
					onClick={() =>
						runAction(
							dismiss({ suggestionId: suggestion._id }),
							"Could not dismiss that suggestion",
						)
					}
				>
					<Button.Icon as={X} />
					Dismiss
				</Button.Root>
			</div>

			{error && !editing ? (
				<p className="mt-2 paragraph-xs text-error-base">{error}</p>
			) : null}
		</article>
	);
}

export function SuggestionsPanel({
	sessionId,
	analysis,
	lines,
	isTutor,
	sessionStatus,
	hasAudio,
	onJump,
}: {
	sessionId: Id<"lessonSessions">;
	analysis: ReviewAnalysis;
	lines: ReviewLine[];
	isTutor: boolean;
	sessionStatus: string;
	hasAudio: boolean;
	onJump: (lineId: string) => void;
}) {
	const byId = new Map(lines.map((line) => [line._id, line]));

	return (
		<div className="min-h-0 flex-1 overflow-y-auto p-4">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
				{!isTutor ? (
					<div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-white-0 p-8 text-center ring-1 ring-stroke-soft-200 ring-inset">
						<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
							<Sparkles className="size-5 text-text-sub-600" />
						</div>
						<h2 className="label-md text-text-strong-950">
							Your tutor reviews this first
						</h2>
						<p className="max-w-sm paragraph-sm text-text-sub-600">
							Automated suggestions are drafts. Anything worth working on appears
							as an ordinary note, and in your study queue, once your tutor has
							confirmed it.
						</p>
					</div>
				) : (
					<>
						<RunCard
							sessionId={sessionId}
							analysis={analysis}
							hasAudio={hasAudio}
							canRun={sessionStatus === "ready" && hasAudio}
						/>

						{analysis.suggestions.length === 0 ? (
							<p className="px-1 paragraph-sm text-text-sub-600">
								{analysis.run === null
									? "No pass has been run on this lesson yet."
									: analysis.run.status === "complete"
										? "Nothing is waiting on you. Run another pass if the lesson has changed, or write notes on the Transcript tab."
										: "Nothing to review yet."}
							</p>
						) : (
							analysis.suggestions.map((suggestion) => (
								<SuggestionCard
									key={suggestion._id}
									suggestion={suggestion}
									line={byId.get(suggestion.transcriptLineId)}
									onJump={onJump}
								/>
							))
						)}
					</>
				)}
			</div>
		</div>
	);
}
