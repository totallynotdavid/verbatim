"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@verbatim/backend/convex/_generated/api";
import type { Id } from "@verbatim/backend/convex/_generated/dataModel";
import * as Conversation from "@verbatim/ui/conversation";
import * as DetailView from "@verbatim/ui/detail-view";
import * as TabMenu from "@verbatim/ui/tab-menu-horizontal";
import { useQuery } from "convex/react";
import { ArrowLeft, MessageSquareText, ScrollText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionStatusBadge } from "@/components/session-status-badge";
import { formatClock, formatLength } from "@/lib/clip";
import { useClipPlayer } from "@/lib/use-clip-player";
import { AnnotationCard } from "./annotation-card";
import { AudioPanel } from "./audio-panel";
import { TranscriptLine } from "./transcript-line";
import type { ReviewAnnotation } from "./types";

const DAY = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});
const TIME = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
});

export function ReviewView({ sessionId }: { sessionId: string }) {
	const review = useQuery(api.lessonSessions.getReview, {
		sessionId: sessionId as Id<"lessonSessions">,
	});

	const [tab, setTab] = useState<"transcript" | "notes">("transcript");
	const [activeLineId, setActiveLineId] = useState<string | null>(null);

	const lines = useMemo(() => review?.lines ?? [], [review]);
	// The audio route reauthorizes this short-lived token on every download.
	const authToken = useAuthToken();
	const player = useClipPlayer({
		url: review?.audio?.url ?? null,
		authToken,
		offsetMs: review?.audio?.offsetMs ?? 0,
		durationMs: review?.audio?.durationMs ?? null,
	});

	// Keep callback dependencies stable when the player object changes.
	const { play, stop, playing, clipFor } = player;

	const activeIndex = lines.findIndex((line) => line._id === activeLineId);
	const activeLine = activeIndex >= 0 ? (lines[activeIndex] ?? null) : null;

	const byLine = useMemo(() => {
		const grouped = new Map<string, ReviewAnnotation[]>();
		for (const annotation of review?.annotations ?? []) {
			const bucket = grouped.get(annotation.transcriptLineId);
			if (bucket) bucket.push(annotation);
			else grouped.set(annotation.transcriptLineId, [annotation]);
		}
		return grouped;
	}, [review]);

	const selectLine = useCallback(
		(lineId: string) => {
			setActiveLineId(lineId);
			const line = lines.find((candidate) => candidate._id === lineId);
			if (line) play({ key: line._id, startMs: line.startMs, endMs: line.endMs });
		},
		[lines, play],
	);

	const step = useCallback(
		(delta: -1 | 1) => {
			if (lines.length === 0) return;
			const next = activeIndex < 0 ? 0 : activeIndex + delta;
			const line = lines[Math.min(Math.max(next, 0), lines.length - 1)];
			if (line) selectLine(line._id);
		},
		[lines, activeIndex, selectLine],
	);

	// Keyboard navigation yields to controls and editable fields.
	useEffect(() => {
		if (tab !== "transcript") return;
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}
			if (event.key === "ArrowDown" || event.key === "j") {
				event.preventDefault();
				step(1);
			} else if (event.key === "ArrowUp" || event.key === "k") {
				event.preventDefault();
				step(-1);
			} else if (event.key === " " && activeLine) {
				event.preventDefault();
				if (playing) stop();
				else
					play({
						key: activeLine._id,
						startMs: activeLine.startMs,
						endMs: activeLine.endMs,
					});
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [tab, step, activeLine, play, stop, playing]);

	if (review === undefined) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="paragraph-sm text-text-sub-600">Loading lesson…</p>
			</div>
		);
	}
	if (review === null) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="paragraph-sm text-text-sub-600">Signing in…</p>
			</div>
		);
	}

	const { session } = review;
	const partnerName =
		session.viewerRole === "tutor" ? session.studentName : session.tutorName;
	const startedAt = new Date(session.startedAt);
	const length = formatLength(
		review.audio?.durationMs ??
			(session.endedAt === null ? null : session.endedAt - session.startedAt),
	);

	return (
		<DetailView.Root>
			<DetailView.Header
				title={`Lesson with ${partnerName ?? "your partner"}`}
				back={
					<Link
						href="/dashboard"
						aria-label="Back to all lessons"
						className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-sub-600 transition-colors hover:bg-bg-weak-50 hover:text-text-strong-950"
					>
						<ArrowLeft className="size-4" />
					</Link>
				}
				subtitle={
					<>
						<span>{DAY.format(startedAt)}</span>
						<span aria-hidden>·</span>
						<span className="font-mono">{TIME.format(startedAt)}</span>
						{length ? (
							<>
								<span aria-hidden>·</span>
								<span>{length}</span>
							</>
						) : null}
						<span aria-hidden>·</span>
						<span>
							{lines.length} {lines.length === 1 ? "line" : "lines"}
						</span>
					</>
				}
				actions={<SessionStatusBadge status={session.status} />}
			>
				<TabMenu.Root
					value={tab}
					onValueChange={(value) => setTab(value as "transcript" | "notes")}
				>
					<TabMenu.List className="h-10 gap-5 border-none">
						<TabMenu.Trigger value="transcript" className="h-10 cursor-pointer gap-1.5">
							<TabMenu.Icon as={ScrollText} className="size-4" />
							Transcript
						</TabMenu.Trigger>
						<TabMenu.Trigger value="notes" className="h-10 cursor-pointer gap-1.5">
							<TabMenu.Icon as={MessageSquareText} className="size-4" />
							Notes
							{review.annotations.length > 0 ? (
								<span className="ml-0.5 rounded-full bg-bg-weak-50 px-1.5 py-0.5 label-xs text-text-sub-600">
									{review.annotations.length}
								</span>
							) : null}
						</TabMenu.Trigger>
					</TabMenu.List>
				</TabMenu.Root>
			</DetailView.Header>

				{/* Playback is limited to the selected clip, so native controls stay hidden. */}
			<audio
				ref={player.audioRef}
				preload="auto"
				className="hidden"
				onTimeUpdate={player.handlers.onTimeUpdate}
				onLoadedMetadata={player.handlers.onLoadedMetadata}
				onEnded={player.handlers.onEnded}
				onPause={player.handlers.onPause}
				onError={player.handlers.onError}
			>
				<track kind="captions" />
			</audio>

			{tab === "transcript" ? (
				<DetailView.Split>
					<DetailView.Main>
						{lines.length === 0 ? (
							<div className="flex flex-1 items-center justify-center p-6 text-center">
								<p className="paragraph-sm text-text-sub-600">
									{session.status === "recording"
										? "This lesson is being captured right now. Lines appear here as they are finalised."
										: "No captions were captured for this lesson. Meet's CC button has to be on for the extension to read them."}
								</p>
							</div>
						) : (
							<Conversation.Root
								label="Lesson transcript"
								followId={activeLineId}
								jumpLabel="Jump to the line you are on"
							>
								{lines.map((line, index) => {
									const previous = lines[index - 1];
									return (
										<TranscriptLine
											key={line._id}
											sessionId={session._id}
											line={line}
											annotations={byLine.get(line._id) ?? []}
											mine={line.speakerId === session.viewerId}
											startsGroup={
												previous === undefined ||
												previous.speakerName !== line.speakerName
											}
											speakerName={line.speakerName ?? "Unknown speaker"}
											active={line._id === activeLineId}
											playing={player.playing && player.activeKey === line._id}
											audioAvailable={clipFor(line).available}
											onSelect={selectLine}
										/>
									);
								})}
							</Conversation.Root>
						)}
					</DetailView.Main>

					<DetailView.Side>
						<DetailView.Card title="Audio">
							<AudioPanel
								player={player}
								activeLine={activeLine}
								activeIndex={activeIndex}
								lineCount={lines.length}
								onStep={step}
								onReplay={() => {
									if (activeLine)
										play({
											key: activeLine._id,
											startMs: activeLine.startMs,
											endMs: activeLine.endMs,
										});
								}}
							/>
							<p className="mt-3 border-stroke-soft-200 border-t pt-3 paragraph-xs text-text-soft-400">
								<kbd className="font-mono">↑</kbd>/<kbd className="font-mono">↓</kbd>{" "}
								walk the transcript, <kbd className="font-mono">space</kbd> replays
								the current line.
							</p>
						</DetailView.Card>

						<DetailView.Card title="Notes on this line">
							{activeLine === null ? (
								<p className="paragraph-sm text-text-sub-600">
									Select a line to see its notes. Select words inside a line to
									attach a note to just those words.
								</p>
							) : (byLine.get(activeLine._id) ?? []).length === 0 ? (
								<p className="paragraph-sm text-text-sub-600">
									No notes on this line yet. Use{" "}
									<span className="text-text-strong-950">note</span> on the line,
									or select words inside it first.
								</p>
							) : (
								<div className="flex flex-col gap-2">
									{(byLine.get(activeLine._id) ?? []).map((annotation) => (
										<AnnotationCard
											key={annotation._id}
											annotation={annotation}
											line={activeLine}
										/>
									))}
								</div>
							)}
						</DetailView.Card>
					</DetailView.Side>
				</DetailView.Split>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					<div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
						{review.annotations.length === 0 ? (
							<p className="paragraph-sm text-text-sub-600">
								No notes on this lesson yet.
							</p>
						) : (
							review.annotations.map((annotation) => {
								const line = lines.find(
									(candidate) => candidate._id === annotation.transcriptLineId,
								);
								return (
									<div key={annotation._id} className="flex flex-col gap-1.5">
										{line ? (
											<button
												type="button"
												onClick={() => {
													setTab("transcript");
													selectLine(line._id);
												}}
												className="w-full cursor-pointer rounded-xl bg-bg-white-0 px-3 py-2.5 text-left ring-1 ring-stroke-soft-200 ring-inset transition-colors hover:bg-bg-weak-50"
											>
												<span className="font-mono text-[11px] text-text-soft-400">
													{line.speakerName ?? "Unknown speaker"} ·{" "}
													{formatClock(line.startMs)}
												</span>
												<span className="mt-0.5 block paragraph-sm text-text-strong-950">
													{line.text}
												</span>
											</button>
										) : null}
										<AnnotationCard annotation={annotation} line={line} />
									</div>
								);
							})
						)}
					</div>
				</div>
			)}
		</DetailView.Root>
	);
}
