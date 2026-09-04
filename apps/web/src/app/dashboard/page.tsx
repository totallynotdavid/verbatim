"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ChevronRight, Inbox, MessageSquareText, Mic, MicOff } from "lucide-react";
import Link from "next/link";
import { SessionStatusBadge } from "@/components/session-status-badge";
import { formatLength } from "@/lib/clip";

const DAY = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	day: "numeric",
	month: "short",
	year: "numeric",
});
const TIME = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
});

export default function DashboardPage() {
	const lessons = useQuery(api.lessonSessions.listForCurrentPair);

	return (
		<div className="flex h-full flex-col">
			<header className="flex h-11 shrink-0 items-center border-stroke-soft-200 border-b px-6 dark:border-white/10">
				<h1 className="label-sm text-text-strong-950">Dashboard</h1>
			</header>

			{lessons === undefined ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<p className="paragraph-sm text-text-sub-600">Loading…</p>
				</div>
			) : lessons.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="flex max-w-sm flex-col items-center gap-3 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
							<Inbox className="size-5 text-text-sub-600" />
						</div>
						<h2 className="label-md text-text-strong-950">No lessons yet</h2>
						<p className="paragraph-sm text-text-sub-600">
							Once the browser extension captures a lesson from Google Meet, it
							will show up here for transcript review and annotation.
						</p>
					</div>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto p-6">
					<div className="mx-auto w-full max-w-3xl">
						<div className="mb-3 flex items-baseline justify-between">
							<h2 className="label-md text-text-strong-950">Lessons</h2>
							<p className="paragraph-xs text-text-sub-600">
								{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
							</p>
						</div>

						<ul className="flex flex-col gap-2">
							{lessons.map((lesson) => {
								const startedAt = new Date(lesson.startedAt);
								const length = formatLength(
									lesson.audioDurationMs ??
										(lesson.endedAt === null
											? null
											: lesson.endedAt - lesson.startedAt),
								);

								return (
									<li key={lesson._id}>
										<Link
											href={`/dashboard/sessions/${lesson._id}`}
											className="group flex items-center gap-4 rounded-xl bg-bg-white-0 px-4 py-3.5 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset transition duration-200 ease-out hover:bg-bg-weak-50 hover:ring-stroke-sub-300"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate label-sm text-text-strong-950">
													Lesson with {lesson.partnerName ?? "your partner"}
												</p>
												<p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 paragraph-xs text-text-sub-600">
													<span>{DAY.format(startedAt)}</span>
													<span aria-hidden>·</span>
													<span className="font-mono">
														{TIME.format(startedAt)}
													</span>
													{length ? (
														<>
															<span aria-hidden>·</span>
															<span>{length}</span>
														</>
													) : null}
													<span aria-hidden>·</span>
													<span className="inline-flex items-center gap-1">
														{lesson.hasAudio ? (
															<Mic className="size-3" />
														) : (
															<MicOff className="size-3" />
														)}
														{lesson.hasAudio ? "Audio" : "No audio"}
													</span>
													{lesson.annotationCount > 0 ? (
														<>
															<span aria-hidden>·</span>
															<span className="inline-flex items-center gap-1">
																<MessageSquareText className="size-3" />
																{lesson.annotationCount}
															</span>
														</>
													) : null}
												</p>
											</div>

											<SessionStatusBadge status={lesson.status} />
											<ChevronRight className="size-4 shrink-0 text-text-soft-400 transition group-hover:translate-x-0.5 group-hover:text-text-sub-600" />
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}
