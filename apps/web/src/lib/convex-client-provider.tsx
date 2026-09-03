"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	return (
		<ConvexAuthNextjsProvider client={convex}>
			<ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
				{children}
			</ThemeProvider>
		</ConvexAuthNextjsProvider>
	);
}
