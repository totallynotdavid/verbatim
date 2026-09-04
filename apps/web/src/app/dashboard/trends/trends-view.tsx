"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Badge from "@verbatim/ui/badge";
import { cn } from "@verbatim/ui/cn";
import * as DetailView from "@verbatim/ui/detail-view";
import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { annotationType } from "@/lib/annotation-types";

type TrendsData = NonNullable<
	FunctionReturnType<typeof api.trends.forCurrentPair>
>;
type SessionTrend = TrendsData["sessions"][number];
type RecurringTerm = TrendsData["recurring"][number];

const DAY = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
});

/** Only lessons with a transcript can carry a rate. */
function withTranscript(sessions: SessionTrend[]): SessionTrend[] {
	return sessions.filter((session) => session.totalWords > 0);
}

export function TrendsView() {
	const data = useQuery(api.trends.forCurrentPair);

	if (data === undefined || data === null) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="paragraph-sm text-text-sub-600">
					{data === undefined ? "Reading your lesson history…" : "Signing in…"}
				</p>
			</div>
		);
	}

	const rated = withTranscript(data.sessions);
	const recurring = data.recurring.filter((term) => term.count > 1);

	return (
		<DetailView.Root>
			<DetailView.Header
				title="Trends"
				subtitle={
					<>
						<span>
							{data.totals.sessionCount}{" "}
							{data.totals.sessionCount === 1 ? "lesson" : "lessons"}
						</span>
						<span aria-hidden>·</span>
						<span>
							{data.totals.annotationCount}{" "}
							{data.totals.annotationCount === 1 ? "note" : "notes"}
						</span>
						<span aria-hidden>·</span>
						<span>{data.totals.totalWords.toLocaleString()} words</span>
					</>
				}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
					{rated.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-white-0 p-10 text-center shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset">
							<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
								<LineChart className="size-5 text-text-sub-600" />
							</div>
							<h2 className="label-md text-text-strong-950">
								Nothing to compare yet
							</h2>
							<p className="max-w-sm paragraph-sm text-text-sub-600">
								Patterns show up once a couple of lessons have captions behind
								them. Capture a lesson with Meet&rsquo;s CC on and this fills in.
							</p>
						</div>
					) : (
						<>
							<DetailView.Card title="Recurring flagged words and sounds">
								<RecurringList terms={recurring} allTerms={data.recurring} />
							</DetailView.Card>

							<div className="grid gap-4 lg:grid-cols-2">
								<DetailView.Card title="Words per minute">
									<Series
										sessions={rated}
										valueOf={(session) => session.wordsPerMinute}
										format={(value) => Math.round(value).toString()}
										suffix="wpm"
										caption="Every transcribed word over the time from the start of the lesson to the last caption. That end point excludes whatever happened after the last thing anyone said, which would otherwise drag the rate down without anyone having spoken more slowly."
									/>
								</DetailView.Card>

								<DetailView.Card title="Filler rate">
									<Series
										sessions={rated}
										valueOf={(session) => session.fillerPer100Words}
										format={(value) => value.toFixed(1)}
										suffix="per 100 words"
										lower
										caption="Filler notes per hundred transcribed words, so a long lesson does not look worse than a short one and a slow lesson does not look better."
									/>
								</DetailView.Card>
							</div>

							<DetailView.Card title="Notes per lesson">
								<LessonTable sessions={data.sessions} />
							</DetailView.Card>
						</>
					)}
				</div>
			</div>
		</DetailView.Root>
	);
}

function RecurringList({
	terms,
	allTerms,
}: {
	/** Terms flagged more than once. */
	terms: RecurringTerm[];
	allTerms: RecurringTerm[];
}) {
	if (terms.length === 0) {
		return (
			<p className="paragraph-sm text-text-sub-600">
				{allTerms.length === 0
					? "No notes yet, so nothing has repeated."
					: "Nothing has been flagged twice yet. Every note so far is about something different."}
			</p>
		);
	}

	const top = terms[0]?.count ?? 1;

	return (
		<ul className="flex flex-col gap-1.5">
			{terms.map((term) => {
				const meta = annotationType(term.types[0] ?? "pronunciation");
				return (
					<li
						key={term.term}
						className="flex items-center gap-3 rounded-xl bg-bg-weak-50 px-3 py-2 ring-1 ring-stroke-soft-200 ring-inset"
					>
						<Badge.Root size="small" variant="lighter" color={meta.color}>
							{term.types.length > 1 ? "mixed" : meta.label}
						</Badge.Root>
						<span
							className={cn(
								"min-w-0 flex-1 truncate paragraph-sm text-text-strong-950",
								term.anchoredCount > 0 && "font-medium",
							)}
							title={term.occurrences[0]?.note ?? term.display}
						>
							{term.anchoredCount > 0 ? `“${term.display}”` : term.display}
						</span>
						<span
							aria-hidden
							className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-bg-white-0 sm:block"
						>
							<span
								className="block h-full rounded-full bg-primary-base"
								style={{ width: `${(term.count / top) * 100}%` }}
							/>
						</span>
						<span className="w-28 shrink-0 text-right font-mono text-[11px] text-text-soft-400">
							{term.count}× · {term.sessionCount}{" "}
							{term.sessionCount === 1 ? "lesson" : "lessons"}
						</span>
						<Link
							href={`/dashboard/sessions/${term.occurrences[0]?.sessionId ?? ""}`}
							className="shrink-0 font-mono text-[11px] text-text-soft-400 hover:text-text-strong-950 hover:underline"
						>
							open
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * A bar per lesson, oldest on the left.
 *
 * Deliberately not a line chart: lessons are irregularly spaced events, not
 * samples of a continuous signal, and a line between two of them would imply
 * values on days when nobody spoke.
 */
function Series({
	sessions,
	valueOf,
	format,
	suffix,
	caption,
	lower,
}: {
	sessions: SessionTrend[];
	valueOf: (session: SessionTrend) => number | null;
	format: (value: number) => string;
	suffix: string;
	caption: string;
	/** Whether a smaller number is the better one. */
	lower?: boolean;
}) {
	const points = sessions.flatMap((session) => {
		const value = valueOf(session);
		return value === null ? [] : [{ session, value }];
	});

	if (points.length === 0) {
		return <p className="paragraph-sm text-text-sub-600">Not enough data yet.</p>;
	}

	const max = Math.max(...points.map((point) => point.value), 0.0001);
	const latest = points.at(-1);
	const previous = points.at(-2);
	const delta =
		latest !== undefined && previous !== undefined
			? latest.value - previous.value
			: null;
	const better = delta === null ? null : lower ? delta < 0 : delta > 0;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline gap-2">
				<span className="text-title-h5 text-text-strong-950">
					{latest === undefined ? "—" : format(latest.value)}
				</span>
				<span className="paragraph-xs text-text-sub-600">{suffix}</span>
				{delta !== null && Math.abs(delta) > 0.05 ? (
					<span
						className={cn(
							"font-mono text-[11px]",
							better ? "text-success-base" : "text-warning-base",
						)}
					>
						{delta > 0 ? "+" : "−"}
						{format(Math.abs(delta))} vs last
					</span>
				) : null}
			</div>

			<div className="flex h-24 items-end gap-1 overflow-x-auto">
				{points.map((point) => (
					<div
						key={point.session._id}
						className="flex min-w-6 flex-1 flex-col items-center gap-1"
						title={`${DAY.format(new Date(point.session.startedAt))}: ${format(point.value)} ${suffix}`}
					>
						<div
							className="w-full rounded-t bg-primary-base/80"
							style={{ height: `${Math.max(2, (point.value / max) * 72)}px` }}
						/>
						<span className="w-full truncate text-center font-mono text-[10px] text-text-soft-400">
							{DAY.format(new Date(point.session.startedAt))}
						</span>
					</div>
				))}
			</div>

			<p className="paragraph-xs text-text-soft-400">{caption}</p>
		</div>
	);
}

function LessonTable({ sessions }: { sessions: SessionTrend[] }) {
	const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[36rem] border-collapse">
				<thead>
					<tr className="border-stroke-soft-200 border-b text-left">
						{["Lesson", "Words", "wpm", "Notes", "Filler", "Types"].map(
							(heading) => (
								<th
									key={heading}
									className="pb-2 subheading-2xs text-text-soft-400 uppercase"
								>
									{heading}
								</th>
							),
						)}
					</tr>
				</thead>
				<tbody>
					{ordered.map((session) => (
						<tr
							key={session._id}
							className="border-stroke-soft-200 border-b last:border-0"
						>
							<td className="py-2 paragraph-sm text-text-strong-950">
								<Link
									href={`/dashboard/sessions/${session._id}`}
									className="hover:underline"
								>
									{DAY.format(new Date(session.startedAt))}
								</Link>
							</td>
							<td className="py-2 font-mono text-[11px] text-text-sub-600">
								{session.totalWords}
								{session.totalWords > 0 ? (
									<span className="text-text-soft-400">
										{" "}
										({Math.round(
											(session.studentWords / session.totalWords) * 100,
										)}
										% student)
									</span>
								) : null}
							</td>
							<td className="py-2 font-mono text-[11px] text-text-sub-600">
								{session.wordsPerMinute === null
									? "—"
									: Math.round(session.wordsPerMinute)}
							</td>
							<td className="py-2 font-mono text-[11px] text-text-sub-600">
								{session.annotationCount}
							</td>
							<td className="py-2 font-mono text-[11px] text-text-sub-600">
								{session.fillerPer100Words === null
									? "—"
									: session.fillerPer100Words.toFixed(1)}
							</td>
							<td className="py-2">
								<div className="flex flex-wrap gap-1">
									{Object.entries(session.annotationsByType)
										.sort((a, b) => b[1] - a[1])
										.map(([type, count]) => {
											const meta = annotationType(type);
											return (
												<Badge.Root
													key={type}
													size="small"
													variant="lighter"
													color={meta.color}
												>
													{meta.label} {count}
												</Badge.Root>
											);
										})}
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
