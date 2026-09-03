import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/lib/convex-client-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: "Verbatim",
	description: "Lesson transcript review and study for English tutoring.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<ConvexAuthNextjsServerProvider>
			<html lang="en" suppressHydrationWarning>
				<body className="antialiased">
					<ConvexClientProvider>{children}</ConvexClientProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
