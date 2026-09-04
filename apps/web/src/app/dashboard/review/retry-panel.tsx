"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Badge from "@verbatim/ui/badge";
import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import { useMutation } from "convex/react";
import { Mic, Play, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/review-grades";
import { scoreColor } from "@/lib/scoring";
import type { ClipPlayer } from "@/lib/use-clip-player";
import { MAX_RETRY_MS, useMicRecorder } from "@/lib/use-mic-recorder";
import type { ReviewCard, RetryRecording } from "./types";

/**
 * Records retries for flagged words and plays them beside the original.
 *
 * Each take stays separate from lesson audio. Worker scores are informational;
 * the student's SM-2 grade remains separate.
 */
export function RetryPanel({
	card,
	viewerId,
	canRecord,
	player,
	selectedRetryId,
	onSelectRetry,
	onBeforeRecord,
}: {
	card: ReviewCard;
	viewerId: string;
	/** Whether this card can accept another retry. */
	canRecord: boolean;
	/** Player bound to the selected saved retry. */
	player: ClipPlayer;
	selectedRetryId: string | null;
	onSelectRetry: (retryId: string | null) => void;
	/** Stops the original clip before the microphone opens. */
	onBeforeRecord: () => void;
}) {
	const recorder = useMicRecorder();
	const generateUploadUrl = useMutation(api.retryRecordings.generateUploadUrl);
	const attach = useMutation(api.retryRecordings.attach);
	const remove = useMutation(api.retryRecordings.remove);

	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const take = recorder.recording;
	const clearTake = recorder.clear;

	// Keep the preview URL alive only while its take exists.
	useEffect(() => {
		if (take === null) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(take.blob);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [take]);

	// A new card must not inherit the previous take.
	useEffect(() => {
		clearTake();
		setSaveError(null);
	}, [card._id, clearTake]);

	async function save() {
		if (take === null) return;
		setSaving(true);
		setSaveError(null);
		try {
			const uploadUrl = await generateUploadUrl({ reviewCardId: card._id });
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": take.mimeType },
				body: take.blob,
			});
			if (!response.ok) {
				throw new Error(`Upload rejected with ${response.status}`);
			}
			const body = (await response.json()) as { storageId?: string };
			if (typeof body.storageId !== "string") {
				throw new Error("Upload response had no storage ID");
			}
			await attach({
				reviewCardId: card._id,
				storageId: body.storageId as Parameters<typeof attach>[0]["storageId"],
				durationMs: take.durationMs,
			});
			recorder.clear();
		} catch (cause) {
			setSaveError(
				cause instanceof Error ? cause.message : "That take could not be saved.",
			);
		} finally {
			setSaving(false);
		}
	}

	const recording = recorder.status === "recording" || recorder.status === "stopping";

	return (
		<div className="flex flex-col gap-3">
			{!canRecord ? null : recorder.status === "unsupported" ? (
				<p className="paragraph-sm text-text-sub-600">
					This browser has no <code className="font-mono">MediaRecorder</code>,
					so retries cannot be recorded here.
				</p>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					{recording ? (
						<Button.Root
							variant="error"
							size="xsmall"
							onClick={recorder.stop}
							aria-label="Stop recording"
						>
							<Button.Icon as={Square} />
							Stop
						</Button.Root>
					) : (
						<Button.Root
							variant="neutral"
							mode="stroke"
							size="xsmall"
							disabled={recorder.status === "requesting" || saving}
							onClick={() => {
								onBeforeRecord();
								recorder.start();
							}}
							aria-label="Record yourself saying this"
						>
							<Button.Icon as={Mic} />
							{recorder.status === "requesting"
								? "Waiting for the mic…"
								: take === null && card.retries.length === 0
									? "Record a retry"
									: "Record another"}
						</Button.Root>
					)}

					{recording ? (
						<>
							<span className="font-mono text-[11px] text-error-base">
								● {formatDuration(recorder.elapsedMs)}
							</span>
							{/* Show a muted microphone before the take is saved. */}
							<span
								aria-hidden
								className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-weak-50"
							>
								<span
									className="block h-full rounded-full bg-error-base transition-[width] duration-75"
									style={{ width: `${Math.round(Math.min(1, recorder.level) * 100)}%` }}
								/>
							</span>
							<span className="paragraph-xs text-text-soft-400">
								stops at {MAX_RETRY_MS / 1000}s
							</span>
						</>
					) : null}
				</div>
			)}

			{canRecord && recorder.error ? (
				<p className="paragraph-xs text-error-base">{recorder.error}</p>
			) : null}

			{take !== null && previewUrl !== null ? (
				<div className="flex flex-col gap-2 rounded-xl bg-bg-weak-50 p-3 ring-1 ring-stroke-soft-200 ring-inset">
					<p className="label-xs text-text-strong-950">
						New take · {formatDuration(take.durationMs)}
					</p>
					{/* The local preview blob can play without an authenticated route. */}
					<audio src={previewUrl} controls className="w-full">
						<track kind="captions" />
					</audio>
					<div className="flex flex-wrap items-center gap-2">
						<Button.Root size="xsmall" onClick={() => void save()} disabled={saving}>
							<Button.Icon as={Upload} />
							{saving ? "Saving…" : "Keep this take"}
						</Button.Root>
						<Button.Root
							variant="neutral"
							mode="stroke"
							size="xsmall"
							onClick={() => recorder.clear()}
							disabled={saving}
						>
							<Button.Icon as={X} />
							Discard
						</Button.Root>
					</div>
					{saveError ? (
						<p className="paragraph-xs text-error-base">{saveError}</p>
					) : null}
				</div>
			) : null}

			{card.retries.length === 0 ? (
				<p className="paragraph-xs text-text-soft-400">
					No saved retries for this card yet. Play the original, say it back,
					then listen to the two side by side.
				</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{card.retries.map((retry, index) => (
						<RetryRow
							key={retry._id}
							retry={retry}
							index={index}
							mine={retry.recordedBy === viewerId}
							selected={retry._id === selectedRetryId}
							playing={player.playing && player.activeKey === retry._id}
							canPlay={player.status === "ready" && retry._id === selectedRetryId}
							onPlay={() => {
								if (retry._id !== selectedRetryId) {
									onSelectRetry(retry._id);
									return;
								}
								if (player.playing) player.stop();
								else
									player.play({
										key: retry._id,
										startMs: 0,
										endMs: retry.durationMs,
									});
							}}
							onRemove={() => {
								if (retry._id === selectedRetryId) onSelectRetry(null);
								void remove({ retryRecordingId: retry._id });
							}}
						/>
					))}
				</ul>
			)}

			{player.status === "error" && selectedRetryId !== null ? (
				<p className="paragraph-xs text-error-base">
					{player.error ?? "That retry could not be loaded."}
				</p>
			) : null}
		</div>
	);
}

function ScoreReadout({
	score,
}: {
	score: NonNullable<RetryRecording["pronunciation"]>;
}) {
	if (score.status === "scoring") {
		return (
			<p className="mt-1.5 font-mono text-[11px] text-text-soft-400">
				scoring this take…
			</p>
		);
	}
	if (score.status === "failed") {
		return (
			<p className="mt-1.5 font-mono text-[11px] text-text-soft-400">
				{score.error ?? "this take could not be scored"}
			</p>
		);
	}

	return (
		<div className="mt-1.5 flex flex-col gap-1.5 rounded-lg bg-bg-weak-50 px-2.5 py-2">
			<div className="flex flex-wrap items-center gap-2">
				{score.score === null ? null : (
					<Badge.Root
						size="small"
						variant="lighter"
						color={scoreColor(score.score)}
					>
						{Math.round(score.score)}/100
					</Badge.Root>
				)}
				<span className="min-w-0 flex-1 truncate paragraph-xs text-text-sub-600">
					heard “{score.transcript ?? "nothing"}”
				</span>
			</div>

			{score.words.length === 0 ? (
				<p className="paragraph-xs text-text-soft-400">
					No sounds flagged against “{score.expectedText}”.
				</p>
			) : (
				<ul className="flex flex-col gap-0.5">
					{score.words.map((word) => (
						<li
							key={`${word.word}-${word.expected}`}
							className="flex flex-wrap items-baseline gap-1.5 paragraph-xs text-text-sub-600"
						>
							<span className="text-text-strong-950">{word.word}</span>
							<span className="font-mono text-[11px] text-text-soft-400">
								/{word.expected}/ → /{word.heard || "…"}/
							</span>
							<span className="font-mono text-[11px] text-text-soft-400">
								{Math.round(word.confidence * 100)}%
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const TIME = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

function RetryRow({
	retry,
	index,
	mine,
	selected,
	playing,
	canPlay,
	onPlay,
	onRemove,
}: {
	retry: RetryRecording;
	index: number;
	mine: boolean;
	selected: boolean;
	playing: boolean;
	/** Whether the shared player already holds this file. */
	canPlay: boolean;
	onPlay: () => void;
	onRemove: () => void;
}) {
	return (
		<li
			className={cn(
				"rounded-lg px-2 py-1.5 ring-1 ring-inset transition-colors",
				selected
					? "bg-bg-white-0 ring-primary-base"
					: "bg-bg-white-0 ring-stroke-soft-200",
			)}
		>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onPlay}
					aria-label={`Play take ${index + 1}`}
					className={cn(
						"inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[11px] transition-colors",
						playing ? "text-primary-base" : "text-text-sub-600 hover:text-text-strong-950",
					)}
				>
					{playing ? <Square className="size-3" /> : <Play className="size-3" />}
					take {index + 1}
				</button>
				<span className="font-mono text-[11px] text-text-soft-400">
					{formatDuration(retry.durationMs)}
				</span>
				<span className="min-w-0 flex-1 truncate paragraph-xs text-text-soft-400">
					{selected && !canPlay ? "loading…" : TIME.format(new Date(retry.createdAt))}
				</span>
				{mine ? (
					<button
						type="button"
						onClick={onRemove}
						aria-label={`Delete take ${index + 1}`}
						className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-error-base"
					>
						<Trash2 className="size-3.5" />
					</button>
				) : (
					<span className="paragraph-xs text-text-soft-400">partner</span>
				)}
			</div>

			{retry.pronunciation === null ? null : (
				<ScoreReadout score={retry.pronunciation} />
			)}
		</li>
	);
}
