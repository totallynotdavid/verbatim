"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Inbox } from "lucide-react";

export default function DashboardPage() {
	const lessons = useQuery(api.lessonSessions.listForCurrentPair);

	return (
		<div className="flex h-full flex-col">
			<header className="flex h-11 shrink-0 items-center border-stroke-soft-200 border-b px-6 dark:border-white/10">
				<h1 className="label-sm text-text-strong-950">Dashboard</h1>
			</header>
			<div className="flex flex-1 items-center justify-center p-6">
				{lessons === undefined ? (
					<p className="paragraph-sm text-text-sub-600">Loading…</p>
				) : (
					<div className="flex max-w-sm flex-col items-center gap-3 text-center">
						<div className="flex size-12 items-center justify-center rounded-full bg-bg-weak-50">
							<Inbox className="size-5 text-text-sub-600" />
						</div>
						<h2 className="label-md text-text-strong-950">No lessons yet</h2>
						<p className="paragraph-sm text-text-sub-600">
							Once the browser extension captures a lesson from Google Meet,
							it will show up here for transcript review and annotation.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
