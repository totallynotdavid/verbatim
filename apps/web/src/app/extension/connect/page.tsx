import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ExtensionHandoff } from "./handoff";

/** Reads the httpOnly auth token for the client-side extension handoff. */
export default async function ExtensionConnectPage() {
	const token = (await convexAuthNextjsToken()) ?? null;

	return (
		<div className="flex min-h-dvh flex-col">
			<ExtensionHandoff
				token={token}
				convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL ?? ""}
			/>
		</div>
	);
}
