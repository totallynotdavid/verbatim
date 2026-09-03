"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Switch from "@verbatim/ui/switch";
import { useMutation, useQuery } from "convex/react";

export default function SettingsPage() {
	const viewer = useQuery(api.users.viewer);
	const setStandingConsent = useMutation(api.users.setStandingConsent);

	return (
		<div className="flex h-full flex-col">
			<header className="flex h-11 shrink-0 items-center border-stroke-soft-200 border-b px-6 dark:border-white/10">
				<h1 className="label-sm text-text-strong-950">Settings</h1>
			</header>
			<div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
				<div className="flex flex-col gap-1">
					<h2 className="label-md text-text-strong-950">Account</h2>
					<div className="rounded-xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200">
						<p className="label-sm text-text-strong-950">
							{viewer?.name ?? "…"}
						</p>
						<p className="paragraph-sm text-text-sub-600">{viewer?.email}</p>
						<p className="paragraph-xs text-text-soft-400 capitalize">
							{viewer?.role ?? ""}
						</p>
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<h2 className="label-md text-text-strong-950">Recording consent</h2>
					<div className="flex items-center justify-between gap-4 rounded-xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200">
						<div className="flex flex-col gap-0.5">
							<p className="label-sm text-text-strong-950">
								Consent to being recorded during lessons
							</p>
							<p className="paragraph-sm text-text-sub-600">
								Both you and your {viewer?.role === "tutor" ? "student" : "tutor"}{" "}
								must have this on before a lesson can be recorded. You can
								revoke it at any time.
							</p>
						</div>
						<Switch.Root
							checked={viewer?.standingConsent ?? false}
							onCheckedChange={(checked) =>
								void setStandingConsent({ consent: checked })
							}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
