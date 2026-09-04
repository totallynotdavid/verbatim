"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import { cn } from "@verbatim/ui/cn";
import * as Conversation from "@verbatim/ui/conversation";
import * as Popover from "@verbatim/ui/popover";
import { useMutation } from "convex/react";
import { Play, StickyNote, Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { ANNOTATION_UNDERLINE } from "@/lib/annotation-types";
import { formatClock } from "@/lib/clip";
import { segmentText, selectionOffsetsWithin, trimRange } from "@/lib/text-range";
import { AnnotationCard } from "./annotation-card";
import { AnnotationForm } from "./annotation-form";
import type { ReviewAnnotation, ReviewData, ReviewLine } from "./types";

export function TranscriptLine({
	sessionId,
	line,
	annotations,
	mine,
	startsGroup,
	speakerName,
	active,
	playing,
	audioAvailable,
	onSelect,
}: {
	sessionId: ReviewData["session"]["_id"];
	line: ReviewLine;
	annotations: ReviewAnnotation[];
	/** Whether this line belongs to the current user. */
	mine: boolean;
	startsGroup: boolean;
	speakerName: string;
	active: boolean;
	playing: boolean;
	/** Whether this line overlaps the recording. */
	audioAvailable: boolean;
	onSelect: (lineId: string) => void;
}) {
	const create = useMutation(api.annotations.create);
	const textRef = useRef<HTMLParagraphElement>(null);

	const [composing, setComposing] = useState(false);
	const [range, setRange] = useState<{ start: number; end: number } | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ranges = annotations.flatMap((annotation) =>
		annotation.charStart !== null && annotation.charEnd !== null
			? [{ start: annotation.charStart, end: annotation.charEnd, annotation }]
			: [],
	);
	const segments = segmentText(line.text, ranges);

	function openComposer(next: { start: number; end: number } | null) {
		setRange(next);
		setError(null);
		setComposing(true);
	}

	/** A selection opens annotation. A plain click starts playback. */
	function handleTextClick() {
		const container = textRef.current;
		const selected = container ? selectionOffsetsWithin(container) : null;
		const trimmed = selected ? trimRange(line.text, selected) : null;
		onSelect(line._id);
		if (trimmed) openComposer(trimmed);
	}

	return (
		<Conversation.Item itemId={line._id} mine={mine} startsGroup={startsGroup}>
			{startsGroup ? (
				<Conversation.Meta mine={mine} className="mt-0 mb-1">
					{speakerName} · {formatClock(line.startMs)}
				</Conversation.Meta>
			) : null}

			<Popover.Root
				open={composing}
				onOpenChange={(open) => {
					setComposing(open);
					if (!open) setRange(null);
				}}
			>
				<Popover.Anchor asChild>
					<Conversation.Bubble
						mine={mine}
						active={active}
						aria-current={active ? "true" : undefined}
					>
						{/* Keep text selectable. The footer carries the keyboard controls. */}
						<p
							ref={textRef}
							onClick={handleTextClick}
							className="cursor-pointer whitespace-pre-wrap break-words"
						>
							{segments.map((segment) => {
									// Use the first note's colour for overlaps. Render all notes below.
								const covering = segment.covering[0];
								return covering ? (
									<span
										key={segment.start}
										className={cn(
											"underline decoration-2 underline-offset-4",
											ANNOTATION_UNDERLINE[covering.annotation.type],
										)}
									>
										{segment.text}
									</span>
								) : (
									<span key={segment.start}>{segment.text}</span>
								);
							})}
						</p>

						<div
							className={cn(
								"mt-2 flex items-center gap-1 font-mono text-[11px] text-text-soft-400",
								mine ? "justify-end" : "justify-start",
							)}
						>
							<button
								type="button"
								onClick={() => onSelect(line._id)}
								disabled={!audioAvailable}
								aria-label={
									audioAvailable
										? `Play this line, spoken at ${formatClock(line.startMs)}`
										: "This line falls outside the recording"
								}
								className={cn(
									"inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
									audioAvailable
										? "cursor-pointer hover:bg-bg-weak-50 hover:text-text-strong-950"
										: "cursor-not-allowed",
									playing && "text-primary-base",
								)}
							>
								{!audioAvailable ? (
									<VolumeX className="size-3" />
								) : playing ? (
									<Volume2 className="size-3" />
								) : (
									<Play className="size-3" />
								)}
								{audioAvailable ? formatClock(line.startMs) : "no audio"}
							</button>

							<button
								type="button"
								onClick={() => {
									onSelect(line._id);
									openComposer(null);
								}}
								aria-label="Add a note on this line"
								className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-bg-weak-50 hover:text-text-strong-950"
							>
								<StickyNote className="size-3" />
								note
							</button>
						</div>
					</Conversation.Bubble>
				</Popover.Anchor>

				<Popover.Content align={mine ? "end" : "start"} side="bottom">
					<AnnotationForm
						quote={range ? line.text.slice(range.start, range.end) : null}
						submitLabel="Add note"
						pending={pending}
						error={error}
						onCancel={() => setComposing(false)}
						onSubmit={({ type, note }) => {
							setPending(true);
							setError(null);
							create({
								sessionId,
								transcriptLineId: line._id,
								type,
								note,
								...(range === null
									? {}
									: { charStart: range.start, charEnd: range.end }),
							})
								.then(() => {
									setComposing(false);
									setRange(null);
									window.getSelection()?.removeAllRanges();
								})
								.catch((cause: unknown) =>
									setError(
										cause instanceof Error
											? cause.message
											: "Could not save that note",
									),
								)
								.finally(() => setPending(false));
						}}
					/>
				</Popover.Content>
			</Popover.Root>

			{annotations.length > 0 ? (
				<div
					className={cn(
						"mt-2 flex w-full max-w-[90%] flex-col gap-1.5",
						mine ? "items-end" : "items-start",
					)}
				>
					{annotations.map((annotation) => (
						<div key={annotation._id} className="w-full">
							<AnnotationCard annotation={annotation} line={line} compact />
						</div>
					))}
				</div>
			) : null}
		</Conversation.Item>
	);
}
