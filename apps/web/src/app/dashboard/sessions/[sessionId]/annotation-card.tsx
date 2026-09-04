"use client";

import * as Badge from "@verbatim/ui/badge";
import * as Popover from "@verbatim/ui/popover";
import { api } from "@verbatim/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { annotationType } from "@/lib/annotation-types";
import { AnnotationForm } from "./annotation-form";
import type { ReviewAnnotation, ReviewLine } from "./types";

export function AnnotationCard({
	annotation,
	line,
	compact,
}: {
	annotation: ReviewAnnotation;
	/** Transcript line used for an anchored quote. */
	line: ReviewLine | undefined;
	compact?: boolean;
}) {
	const meta = annotationType(annotation.type);
	const update = useMutation(api.annotations.update);
	const remove = useMutation(api.annotations.remove);

	const [editing, setEditing] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const quote =
		line && annotation.charStart !== null && annotation.charEnd !== null
			? line.text.slice(annotation.charStart, annotation.charEnd)
			: null;

	return (
		<div className="rounded-xl bg-bg-weak-50 px-3 py-2.5 ring-1 ring-stroke-soft-200 ring-inset">
			<div className="flex items-start gap-2">
				<Badge.Root size="medium" variant="lighter" color={meta.color}>
					{meta.label}
				</Badge.Root>
				<div className="min-w-0 flex-1" />
				{annotation.isOwn ? (
					<div className="flex shrink-0 items-center gap-0.5">
						<Popover.Root open={editing} onOpenChange={setEditing}>
							<Popover.Trigger asChild>
								<button
									type="button"
									aria-label="Edit this note"
									className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-white-0 hover:text-text-strong-950"
								>
									<Pencil className="size-3.5" />
								</button>
							</Popover.Trigger>
							<Popover.Content align="end" showArrow={false}>
								<AnnotationForm
									initialType={annotation.type}
									initialNote={annotation.note}
									quote={quote}
									submitLabel="Save"
									pending={pending}
									error={error}
									onCancel={() => setEditing(false)}
									onSubmit={({ type, note }) => {
										setPending(true);
										setError(null);
										update({ annotationId: annotation._id, type, note })
											.then(() => setEditing(false))
											.catch((cause: unknown) =>
												setError(
													cause instanceof Error ? cause.message : "Could not save",
												),
											)
											.finally(() => setPending(false));
									}}
								/>
							</Popover.Content>
						</Popover.Root>

						<button
							type="button"
							aria-label="Delete this note"
							onClick={() => {
								setError(null);
								remove({ annotationId: annotation._id }).catch((cause: unknown) =>
									setError(
										cause instanceof Error ? cause.message : "Could not delete",
									),
								);
							}}
							className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-white-0 hover:text-error-base"
						>
							<Trash2 className="size-3.5" />
						</button>
					</div>
				) : null}
			</div>

			{quote ? (
				<p className="mt-1.5 paragraph-xs text-text-sub-600">
					“<span className="text-text-strong-950">{quote}</span>”
				</p>
			) : null}

			<p className="mt-1 whitespace-pre-wrap break-words paragraph-sm text-text-strong-950">
				{annotation.note}
			</p>

				{/* Controls identify own inline notes. Partner notes keep a byline. */}
			{compact && annotation.isOwn ? null : (
				<p className="mt-1.5 font-mono text-[11px] text-text-soft-400">
					{annotation.isOwn ? "You" : (annotation.authorName ?? "Your partner")}
				</p>
			)}

			{error ? (
				<p className="mt-1 paragraph-xs text-error-base">{error}</p>
			) : null}
		</div>
	);
}
