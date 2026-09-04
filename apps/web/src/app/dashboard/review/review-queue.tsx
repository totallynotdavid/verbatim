"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@verbatim/backend/convex/_generated/api";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import * as DetailView from "@verbatim/ui/detail-view";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, CheckCircle2, Repeat2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ANNOTATION_UNDERLINE,
	annotationType,
	supportsRetry,
} from "@/lib/annotation-types";
import { formatClock } from "@/lib/clip";
import {
	formatDueIn,
	formatInterval,
	type GradeValue,
	gradeLabel,
	REVIEW_GRADES,
} from "@/lib/review-grades";
import { segmentText } from "@/lib/text-range";
import { useClipPlayer } from "@/lib/use-clip-player";
import { ClipPanel } from "./clip-panel";
import { RetryPanel } from "./retry-panel";
import type { ReviewCard } from "./types";

const DAY = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
});

export function ReviewQueue() {
	const data = useQuery(api.reviewCards.queue);
	const viewer = useQuery(api.users.viewer);
	const gradeCard = useMutation(api.reviewCards.grade);
	const authToken = useAuthToken();

	/** Cards graded in this sitting, so the queue does not jump as it reactively shrinks. */
	const [reviewed, setReviewed] = useState<Set<string>>(new Set());
	const [selectedRetryId, setSelectedRetryId] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const remaining = useMemo(
		() => (data?.cards ?? []).filter((card) => !reviewed.has(card._id)),
		[data, reviewed],
	);
	const card: ReviewCard | null = remaining[0] ?? null;

	const original = useClipPlayer({
		url: card?.session.audio?.url ?? null,
		authToken,
		offsetMs: card?.session.audio?.offsetMs ?? 0,
		durationMs: card?.session.audio?.durationMs ?? null,
	});

	const selectedRetry =
		card?.retries.find((retry) => retry._id === selectedRetryId) ?? null;
	const retry = useClipPlayer({
		url: selectedRetry?.url ?? null,
		authToken,
		// A retry is a whole file, not a window inside a longer recording.
		offsetMs: 0,
		durationMs: selectedRetry?.durationMs ?? null,
	});

	const { play: playOriginal, stop: stopOriginal } = original;
	const { play: playRetry, stop: stopRetry, status: retryStatus } = retry;

	const playCurrent = useCallback(() => {
		if (card === null) return;
		stopRetry();
		playOriginal({
			key: card._id,
			startMs: card.line.startMs,
			endMs: card.line.endMs,
		});
	}, [card, playOriginal, stopRetry]);

	// Newest take is the one worth hearing against the original.
	const latestRetryId = card?.retries.at(-1)?._id ?? null;
	useEffect(() => {
		setSelectedRetryId(latestRetryId);
	}, [latestRetryId]);

	// Play a retry as soon as its file is ready, so one click is enough.
	const [autoPlayRetry, setAutoPlayRetry] = useState(false);
	useEffect(() => {
		if (!autoPlayRetry || retryStatus !== "ready" || selectedRetry === null) return;
		setAutoPlayRetry(false);
		stopOriginal();
		playRetry({
			key: selectedRetry._id,
			startMs: 0,
			endMs: selectedRetry.durationMs,
		});
	}, [autoPlayRetry, retryStatus, selectedRetry, playRetry, stopOriginal]);

	const submit = useCallback(
		(grade: GradeValue) => {
			if (card === null || pending) return;
			setPending(true);
			setError(null);
			stopOriginal();
			stopRetry();
			gradeCard({ reviewCardId: card._id, grade })
				.then(() =>
					setReviewed((current) => new Set(current).add(card._id)),
				)
				.catch((cause: unknown) =>
					setError(
						cause instanceof Error ? cause.message : "That review could not be saved",
					),
				)
				.finally(() => setPending(false));
		},
		[card, pending, gradeCard, stopOriginal, stopRetry],
	);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				// Space belongs to a focused button and to the take preview's own
				// transport controls, not to this shortcut.
				target?.tagName === "BUTTON" ||
				target?.tagName === "AUDIO" ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}
			if (event.key === " ") {
				event.preventDefault();
				if (original.playing) stopOriginal();
				else playCurrent();
				return;
			}
			const match = REVIEW_GRADES.find((option) => option.key === event.key);
			if (match) {
				event.preventDefault();
				submit(match.grade);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [original.playing, stopOriginal, playCurrent, submit]);

	const audioElements = (
		<>
			{/* Both players seek within a downloaded blob, so controls stay hidden. */}
			<audio
				ref={original.audioRef}
				preload="auto"
				className="hidden"
				onTimeUpdate={original.handlers.onTimeUpdate}
				onLoadedMetadata={original.handlers.onLoadedMetadata}
				onEnded={original.handlers.onEnded}
				onPause={original.handlers.onPause}
				onError={original.handlers.onError}
			>
				<track kind="captions" />
			</audio>
			<audio
				ref={retry.audioRef}
				preload="auto"
				className="hidden"
				onTimeUpdate={retry.handlers.onTimeUpdate}
				onLoadedMetadata={retry.handlers.onLoadedMetadata}
				onEnded={retry.handlers.onEnded}
				onPause={retry.handlers.onPause}
				onError={retry.handlers.onError}
			>
				<track kind="captions" />
			</audio>
		</>
	);

	if (data === undefined || data === null) {
		return (
			<div className="flex h-full items-center justify-center">
				{audioElements}
				<p className="paragraph-sm text-text-sub-600">
					{data === undefined ? "Loading your queue…" : "Signing in…"}
				</p>
			</div>
		);
	}

	const done = reviewed.size;
	const total = done + remaining.length;

	return (
		<DetailView.Root>
			{audioElements}
			<DetailView.Header
				title="Review"
				subtitle={
					<>
						<span>
							{total === 0
								? "Nothing due"
								: `${done} of ${total} done today`}
						</span>
						{data.upcoming.total > 0 ? (
							<>
								<span aria-hidden>·</span>
								<span>
									{data.upcoming.total} scheduled ahead
									{data.upcoming.nextDueAt === null
										? ""
										: `, next ${formatDueIn(data.upcoming.nextDueAt, data.now)}`}
								</span>
							</>
						) : null}
					</>
				}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
					{total > 0 ? (
						<div
							className="h-1 w-full overflow-hidden rounded-full bg-bg-weak-50"
							role="progressbar"
							aria-valuenow={done}
							aria-valuemin={0}
							aria-valuemax={total}
							aria-label="Cards reviewed today"
						>
							<div
								className="h-full rounded-full bg-primary-base transition-[width] duration-300 ease-out"
								style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
							/>
						</div>
					) : null}

					{card === null ? (
						<EmptyQueue
							reviewedCount={done}
							upcoming={data.upcoming}
							now={data.now}
						/>
					) : (
						<CardView
							card={card}
							viewerId={viewer?._id ?? ""}
							original={original}
							retryPlayer={retry}
							selectedRetryId={selectedRetryId}
							onSelectRetry={(id) => {
								setSelectedRetryId(id);
								setAutoPlayRetry(id !== null);
							}}
							onPlayOriginal={playCurrent}
							onGrade={submit}
							pending={pending}
							error={error}
						/>
					)}
				</div>
			</div>
		</DetailView.Root>
	);
}

function EmptyQueue({
	reviewedCount,
	upcoming,
	now,
}: {
	reviewedCount: number;
	upcoming: { total: number; withinWeek: number; nextDueAt: number | null };
	now: number;
}) {
	return (
		<div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-white-0 p-10 text-center shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
				{reviewedCount > 0 ? (
					<CheckCircle2 className="size-5 text-success-base" />
				) : (
					<CalendarClock className="size-5 text-text-sub-600" />
				)}
			</div>
			<h2 className="label-md text-text-strong-950">
				{reviewedCount > 0 ? "Queue cleared" : "Nothing due right now"}
			</h2>
			<p className="max-w-sm paragraph-sm text-text-sub-600">
				{upcoming.total === 0 ? (
					<>
						Cards appear here as soon as a note is attached to a lesson line.
						Open a lesson and flag something to start the queue.
					</>
				) : (
					<>
						{upcoming.total} {upcoming.total === 1 ? "card is" : "cards are"}{" "}
						scheduled ahead
						{upcoming.nextDueAt === null
							? "."
							: `, the next one ${formatDueIn(upcoming.nextDueAt, now)}.`}{" "}
						{upcoming.withinWeek > 0
							? `${upcoming.withinWeek} within the week.`
							: ""}
					</>
				)}
			</p>
			<Link
				href="/dashboard"
				className="label-sm text-primary-base hover:underline"
			>
				Back to lessons
			</Link>
		</div>
	);
}

function CardView({
	card,
	viewerId,
	original,
	retryPlayer,
	selectedRetryId,
	onSelectRetry,
	onPlayOriginal,
	onGrade,
	pending,
	error,
}: {
	card: ReviewCard;
	viewerId: string;
	original: ReturnType<typeof useClipPlayer>;
	retryPlayer: ReturnType<typeof useClipPlayer>;
	selectedRetryId: string | null;
	onSelectRetry: (retryId: string | null) => void;
	onPlayOriginal: () => void;
	onGrade: (grade: GradeValue) => void;
	pending: boolean;
	error: string | null;
}) {
	const meta = annotationType(card.annotation.type);
	// Keep takes reachable on a card whose note was re-typed after they were
	// recorded, even though a new one cannot be started.
	const canRecord = supportsRetry(card.annotation.type);
	const showRetry = canRecord || card.retries.length > 0;
	const ranges =
		card.annotation.charStart !== null && card.annotation.charEnd !== null
			? [{ start: card.annotation.charStart, end: card.annotation.charEnd }]
			: [];
	const segments = segmentText(card.line.text, ranges);

	return (
		<article className="flex flex-col gap-4 rounded-2xl bg-bg-white-0 p-5 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex flex-wrap items-center gap-2">
				<Badge.Root size="medium" variant="lighter" color={meta.color}>
					{meta.label}
				</Badge.Root>
				<Link
					href={`/dashboard/sessions/${card.session._id}`}
					className="font-mono text-[11px] text-text-soft-400 hover:text-text-strong-950 hover:underline"
				>
					{DAY.format(new Date(card.session.startedAt))} ·{" "}
					{formatClock(card.line.startMs)}
				</Link>
				<span className="min-w-0 flex-1" />
				<span className="font-mono text-[11px] text-text-soft-400">
					{card.repetitions === 0
						? "new card"
						: `seen ${card.repetitions}× · ${formatInterval(card.interval)} · ease ${card.ease.toFixed(2)}`}
				</span>
			</div>

			<blockquote className="border-stroke-soft-200 border-l-2 pl-3">
				<p className="paragraph-md leading-relaxed text-text-strong-950">
					{segments.map((segment) => (
						<span
							key={segment.start}
							className={
								segment.covering.length > 0
									? cn(
											"underline decoration-2 underline-offset-4",
											ANNOTATION_UNDERLINE[card.annotation.type],
										)
									: undefined
							}
						>
							{segment.text}
						</span>
					))}
				</p>
				<footer className="mt-1 font-mono text-[11px] text-text-soft-400">
					{card.line.speakerName ?? "Unknown speaker"}
				</footer>
			</blockquote>

			<p className="whitespace-pre-wrap break-words rounded-xl bg-bg-weak-50 px-3 py-2.5 paragraph-sm text-text-strong-950">
				{card.annotation.note}
				<span className="mt-1.5 block font-mono text-[11px] text-text-soft-400">
					{card.annotation.authorName ?? "Your partner"}
				</span>
			</p>

			<div className={cn("grid gap-4", showRetry && "sm:grid-cols-2")}>
				<section className="flex flex-col gap-2">
					<h3 className="subheading-xs text-text-soft-400 uppercase">Original</h3>
					<ClipPanel card={card} player={original} onPlay={onPlayOriginal} />
				</section>

				{showRetry ? (
					<section className="flex flex-col gap-2">
						<h3 className="flex items-center gap-1.5 subheading-xs text-text-soft-400 uppercase">
							<Repeat2 className="size-3.5" />
							Your retry
						</h3>
						<RetryPanel
							card={card}
							viewerId={viewerId}
							canRecord={canRecord}
							player={retryPlayer}
							selectedRetryId={selectedRetryId}
							onSelectRetry={onSelectRetry}
							onBeforeRecord={original.stop}
						/>
					</section>
				) : null}
			</div>

			<div className="flex flex-col gap-2 border-stroke-soft-200 border-t pt-4">
				<p className="paragraph-xs text-text-soft-400">
					How did that go? The answer sets when this card comes back.
				</p>
				<div className="flex flex-wrap gap-2">
					{REVIEW_GRADES.map((option) => (
						<Button.Root
							key={option.grade}
							variant={option.variant}
							mode={option.variant === "primary" ? "filled" : "stroke"}
							size="xsmall"
							disabled={pending}
							title={option.hint}
							onClick={() => onGrade(option.grade)}
						>
							<span className="font-mono text-[11px] opacity-60">
								{option.key}
							</span>
							{option.label}
						</Button.Root>
					))}
				</div>
				{card.lastReviewedAt !== null ? (
					<p className="paragraph-xs text-text-soft-400">
						Last reviewed {DAY.format(new Date(card.lastReviewedAt))}
						{card.lastGrade === null ? "" : ` as ${gradeLabel(card.lastGrade)}`},
						then scheduled {formatInterval(card.interval)} out
						{card.lapses > 0
							? ` · ${card.lapses} ${card.lapses === 1 ? "lapse" : "lapses"}`
							: ""}
					</p>
				) : null}
				{error ? <p className="paragraph-xs text-error-base">{error}</p> : null}
				<p className="paragraph-xs text-text-soft-400">
					<kbd className="font-mono">space</kbd> replays the original,{" "}
					<kbd className="font-mono">1</kbd>–<kbd className="font-mono">4</kbd>{" "}
					grade the card.
				</p>
			</div>
		</article>
	);
}
