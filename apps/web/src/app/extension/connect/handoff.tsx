"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Button from "@verbatim/ui/button";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
	EXTENSION_ID,
	type ExternallyConnectableChrome,
} from "@/lib/extension";

type Handoff =
	| { kind: "sending" }
	| { kind: "sent"; expiresAt: number | null }
	| { kind: "failed"; reason: string };

/** Reads the `exp` claim so the page can show when the token expires. */
function expiryOf(token: string): number | null {
	const payload = token.split(".")[1];
	if (payload === undefined) return null;
	try {
		const claims = JSON.parse(
			atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
		) as { exp?: number };
		return typeof claims.exp === "number" ? claims.exp * 1000 : null;
	} catch {
		return null;
	}
}

/** Sends the server-read auth token through Chrome's external messaging API. */
export function ExtensionHandoff({
	token,
	convexUrl,
}: {
	token: string | null;
	convexUrl: string;
}) {
	const router = useRouter();
	const viewer = useQuery(api.users.viewer);
	const [handoff, setHandoff] = useState<Handoff>({ kind: "sending" });

	const send = useCallback(() => {
		if (token === null) {
			setHandoff({
				kind: "failed",
				reason: "No auth token for this session. Try signing in again.",
			});
			return;
		}
		const runtime = (globalThis as ExternallyConnectableChrome).runtime;
		if (runtime?.sendMessage === undefined) {
			setHandoff({
				kind: "failed",
				reason:
					"This browser has no extension bridge. Open this page in Chrome with the Verbatim extension installed.",
			});
			return;
		}

		setHandoff({ kind: "sending" });
		runtime.sendMessage(
			EXTENSION_ID,
			{
				type: "verbatim:connect",
				token,
				convexUrl,
				account: viewer?.name ?? viewer?.email ?? null,
			},
			(response) => {
				const error = (globalThis as ExternallyConnectableChrome).runtime
					?.lastError;
				if (error !== undefined) {
					setHandoff({
						kind: "failed",
						reason: `The extension did not answer (${
							error.message ?? "unknown error"
						}). Is it installed and enabled?`,
					});
					return;
				}
				const ok =
					typeof response === "object" &&
					response !== null &&
					(response as { ok?: boolean }).ok === true;
				if (!ok) {
					setHandoff({
						kind: "failed",
						reason: "The extension rejected the token.",
					});
					return;
				}
				setHandoff({ kind: "sent", expiresAt: expiryOf(token) });
			},
		);
	}, [token, convexUrl, viewer?.name, viewer?.email]);

	useEffect(() => {
		send();
	}, [send]);

	// `undefined` while the query is in flight, `null` when signed out.
	let setupMessage: string | null = null;
	if (viewer !== undefined && viewer !== null) {
		if (viewer.partner === null) {
			setupMessage =
				"You are not paired with a tutor or student yet, so a lesson cannot be started.";
		} else if (viewer.standingConsent !== true) {
			setupMessage =
				"Recording consent is off in Settings. Both of you have to turn it on before a lesson can be recorded.";
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
			<div className="flex flex-col gap-1">
				<h1 className="label-md text-text-strong-950">Connect the extension</h1>
				<p className="paragraph-sm text-text-sub-600">
					The Verbatim browser extension records Google Meet captions as you.
					This page hands it a sign-in token for {viewer?.email ?? "your account"}.
				</p>
			</div>

			<div className="rounded-xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200">
				{handoff.kind === "sending" && (
					<p className="paragraph-sm text-text-sub-600">
						Handing the token to the extension…
					</p>
				)}
				{handoff.kind === "sent" && (
					<>
						<p className="label-sm text-text-strong-950">Extension connected</p>
						<p className="paragraph-sm text-text-sub-600">
							{handoff.expiresAt === null
								? "You can go back to your Meet call."
								: `This sign-in lasts until ${new Date(
										handoff.expiresAt,
									).toLocaleTimeString()}. After that the extension will ask you to come back here.`}
						</p>
					</>
				)}
				{handoff.kind === "failed" && (
					<>
						<p className="label-sm text-text-strong-950">Not connected</p>
						<p className="paragraph-sm text-text-sub-600">{handoff.reason}</p>
					</>
				)}
			</div>

			{setupMessage !== null && (
				<div className="rounded-xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200">
					<p className="label-sm text-text-strong-950">Before your first lesson</p>
					<p className="paragraph-sm text-text-sub-600">{setupMessage}</p>
				</div>
			)}

			<div className="flex gap-2">
				<Button.Root
					variant="primary"
					mode="filled"
					size="small"
					onClick={() => {
						// Refresh the server-read token before sending it again.
						router.refresh();
						send();
					}}
				>
					Refresh connection
				</Button.Root>
				<Button.Root
					variant="neutral"
					mode="stroke"
					size="small"
					onClick={() => router.push("/dashboard")}
				>
					Back to dashboard
				</Button.Root>
			</div>
		</div>
	);
}
