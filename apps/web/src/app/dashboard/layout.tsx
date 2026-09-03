"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
	const viewer = useQuery(api.users.viewer);
	const router = useRouter();

	useEffect(() => {
		if (viewer === null) {
			router.replace("/");
			return;
		}
		if (viewer?.role === null) {
			router.replace("/onboarding/role");
			return;
		}
		if (viewer?.partner === null) {
			router.replace("/onboarding/pairing");
		}
	}, [viewer, router]);

	if (!viewer || viewer.partner === null) {
		return null;
	}

	return (
		<div className="flex h-dvh">
			<AppSidebar />
			<main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
		</div>
	);
}
