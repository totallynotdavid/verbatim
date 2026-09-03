import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Google Meet is the lesson platform, so Google is the only sign-in provider.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google({
			profile(googleProfile) {
				return {
					id: googleProfile.sub,
					name: googleProfile.name,
					email: googleProfile.email,
					image: googleProfile.picture,
					googleSub: googleProfile.sub,
				};
			},
		}),
	],
});
