"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Button from "@verbatim/ui/button";
import * as Input from "@verbatim/ui/input";
import * as Label from "@verbatim/ui/label";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PairingPage() {
	const viewer = useQuery(api.users.viewer);
	const createInvite = useMutation(api.users.createPairingInvite);
	const acceptInvite = useMutation(api.users.acceptPairingInvite);
	const router = useRouter();

	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [generating, setGenerating] = useState(false);
	const [redeeming, setRedeeming] = useState(false);

	useEffect(() => {
		if (viewer === null) {
			router.replace("/");
		} else if (viewer) {
			if (viewer.role === null) {
				router.replace("/onboarding/role");
			} else if (viewer.partner !== null) {
				router.replace("/dashboard");
			}
		}
	}, [viewer, router]);

	async function handleGenerate() {
		setError(null);
		setGenerating(true);
		try {
			await createInvite({});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setGenerating(false);
		}
	}

	async function handleRedeem() {
		setError(null);
		setRedeeming(true);
		try {
			await acceptInvite({ code });
			router.replace("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setRedeeming(false);
		}
	}

	const otherRole = viewer?.role === "tutor" ? "student" : "tutor";

	return (
		<main className="flex min-h-dvh items-center justify-center px-4">
			<div className="flex w-full max-w-md flex-col gap-6 rounded-2xl bg-bg-white-0 p-8 shadow-regular-md ring-1 ring-stroke-soft-200">
				<div className="flex flex-col gap-1.5 text-center">
					<h1 className="title-h6 text-text-strong-950">
						Pair with your {otherRole}
					</h1>
					<p className="paragraph-sm text-text-sub-600">
						One of you generates a code, the other enters it. You only need
						to do this once.
					</p>
				</div>

				<div className="flex flex-col gap-2 rounded-xl bg-bg-weak-50 p-4">
					<p className="label-sm text-text-strong-950">Share a code</p>
					{viewer?.pairingInviteCode ? (
						<p className="title-h5 text-center tracking-[0.3em] text-primary-base">
							{viewer.pairingInviteCode}
						</p>
					) : (
						<Button.Root
							variant="neutral"
							mode="stroke"
							size="small"
							disabled={generating}
							onClick={() => void handleGenerate()}
						>
							{generating ? "Generating…" : "Generate invite code"}
						</Button.Root>
					)}
				</div>

				<div className="flex items-center gap-3">
					<div className="h-px flex-1 bg-stroke-soft-200" />
					<span className="subheading-2xs text-text-soft-400">OR</span>
					<div className="h-px flex-1 bg-stroke-soft-200" />
				</div>

				<div className="flex flex-col gap-2">
					<Label.Root htmlFor="invite-code">Enter their code</Label.Root>
					<Input.Root
						id="invite-code"
						placeholder="ABC123"
						value={code}
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						maxLength={6}
					/>
					<Button.Root
						size="medium"
						disabled={redeeming || code.trim().length === 0}
						onClick={() => void handleRedeem()}
					>
						{redeeming ? "Pairing…" : "Pair"}
					</Button.Root>
				</div>

				{error && <p className="paragraph-sm text-error-base">{error}</p>}
			</div>
		</main>
	);
}
