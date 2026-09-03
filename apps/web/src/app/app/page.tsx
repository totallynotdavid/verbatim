"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Routes signed-in users through onboarding or to the dashboard. */
export default function AppRouterPage() {
	const viewer = useQuery(api.users.viewer);
	const router = useRouter();

	useEffect(() => {
		if (viewer === undefined) return;
		if (viewer === null) {
			router.replace("/");
			return;
		}
		if (viewer.role === null) {
			router.replace("/onboarding/role");
			return;
		}
		if (viewer.partner === null) {
			router.replace("/onboarding/pairing");
			return;
		}
		router.replace("/dashboard");
	}, [viewer, router]);

	return (
		<main className="flex min-h-dvh items-center justify-center">
			<p className="paragraph-sm text-text-sub-600">Loading…</p>
		</main>
	);
}
