"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import * as Button from "@verbatim/ui/button";
import { Logo } from "@/components/logo";

export default function SignInPage() {
	const { signIn } = useAuthActions();

	return (
		<main className="flex min-h-dvh items-center justify-center px-4">
			<div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-bg-white-0 p-8 text-center shadow-regular-md ring-1 ring-stroke-soft-200">
				<Logo className="size-10" />
				<div className="flex flex-col gap-1.5">
					<h1 className="title-h6 text-text-strong-950">Verbatim</h1>
					<p className="paragraph-sm text-text-sub-600">
						Review your Google Meet lessons: transcript, audio, and
						annotations in one place.
					</p>
				</div>
				<Button.Root
					size="medium"
					className="w-full"
					onClick={() => void signIn("google", { redirectTo: "/app" })}
				>
					Sign in with Google
				</Button.Root>
			</div>
		</main>
	);
}
