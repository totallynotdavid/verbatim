import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/"]);
const isProtectedRoute = createRouteMatcher(["/app", "/onboarding(.*)", "/dashboard(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	const authenticated = await convexAuth.isAuthenticated();

	if (isSignInPage(request) && authenticated) {
		return nextjsMiddlewareRedirect(request, "/app");
	}
	if (isProtectedRoute(request) && !authenticated) {
		return nextjsMiddlewareRedirect(request, "/");
	}
});

export const config = {
	matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
