"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Button from "@verbatim/ui/button";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RoleSelectionPage() {
	const viewer = useQuery(api.users.viewer);
	const setRole = useMutation(api.users.setRole);
	const router = useRouter();
	const [pending, setPending] = useState<"tutor" | "student" | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (viewer && viewer.role !== null) {
			router.replace(viewer.partner === null ? "/onboarding/pairing" : "/dashboard");
		}
	}, [viewer, router]);

	async function choose(role: "tutor" | "student") {
		setError(null);
		setPending(role);
		try {
			await setRole({ role });
			router.replace("/onboarding/pairing");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
			setPending(null);
		}
	}

	return (
		<main className="flex min-h-dvh items-center justify-center px-4">
			<div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-bg-white-0 p-8 shadow-regular-md ring-1 ring-stroke-soft-200">
				<div className="flex flex-col gap-1.5 text-center">
					<h1 className="title-h6 text-text-strong-950">
						Are you the tutor or the student?
					</h1>
					<p className="paragraph-sm text-text-sub-600">
						This is set once and can't be changed later.
					</p>
				</div>
				<div className="flex flex-col gap-2.5">
					<Button.Root
						variant="neutral"
						mode="stroke"
						size="medium"
						disabled={pending !== null}
						onClick={() => void choose("tutor")}
					>
						{pending === "tutor" ? "Setting up…" : "I'm the tutor"}
					</Button.Root>
					<Button.Root
						variant="neutral"
						mode="stroke"
						size="medium"
						disabled={pending !== null}
						onClick={() => void choose("student")}
					>
						{pending === "student" ? "Setting up…" : "I'm the student"}
					</Button.Root>
				</div>
				{error && <p className="paragraph-sm text-error-base">{error}</p>}
			</div>
		</main>
	);
}
