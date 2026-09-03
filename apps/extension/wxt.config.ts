import { readFileSync } from "node:fs";
import { defineConfig } from "wxt";

/** WXT provides the MV3 build and offscreen-document support needed for audio. */

/** The public key keeps the unpacked extension ID stable for the web handoff. */
const EXTENSION_KEY =
	"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzZkEA8lFmk0yrkHiMKQzagPvu+DgeXQbz3u8LT9cTNotU3ymKG1ovXIFoVAI6NfkHZHbiEvG1cnbs96LQlhBb+h2LNPmsRdJBqZceZepLwBasgWJFewyiZOLl2sQ5rpLM1QfVoW07dGm2U7bpxQ5RJiak2BKYWkdthfaoxzY3oylwIhLsQhfv43kJ/yAHxRMoj/3pXEUy/0mU1tKcnFkOAGwJuwe902/2aS3XkKEFiyk3E+EHWUT0KmcfGm6qlUlEES03dlMzqHlfKgRbrK2oJgyoZD73Gw8tWkc/zBDvrZYaLWzCaaCkJ0WnOhHzH//poXX+p6AaSBrm9Phg3wV0wIDAQAB";

/** Reuses the backend deployment URL unless `WXT_CONVEX_URL` overrides it. */
function convexUrlFromBackendEnv(): string {
	try {
		const env = readFileSync(
			new URL("../../packages/convex/.env.local", import.meta.url),
			"utf8",
		);
		return /^CONVEX_URL=(.+)$/m.exec(env)?.[1]?.trim() ?? "";
	} catch {
		return "";
	}
}

export default defineConfig({
	srcDir: "src",
	manifestVersion: 3,

	manifest: {
		name: "Verbatim Capture",
		description:
			"Captures Google Meet captions into a Verbatim lesson transcript.",
		key: EXTENSION_KEY,
		permissions: [
			// Stores the auth token and in-flight capture state.
			"storage",
			// Sends state to Meet tabs and opens the connect page.
			"tabs",
			// Revives the service worker so buffered lines keep flushing.
			"alarms",
		],
		host_permissions: [
			// The service worker calls Convex mutations directly.
			"https://*.convex.cloud/*",
		],
		// Add the production origin here before shipping.
		externally_connectable: {
			matches: ["http://localhost/*"],
		},
	},

	vite: () => {
		const convexUrl = process.env.WXT_CONVEX_URL || convexUrlFromBackendEnv();
		if (convexUrl === "") {
			// `wxt prepare` can run before `convex dev` writes the env file.
			console.warn(
				"[verbatim] No Convex URL baked in. Run `bunx convex dev` in packages/convex and rebuild, or set WXT_CONVEX_URL.",
			);
		}
		return {
			define: {
				"import.meta.env.WXT_CONVEX_URL": JSON.stringify(convexUrl),
				"import.meta.env.WXT_WEB_ORIGIN": JSON.stringify(
					process.env.WXT_WEB_ORIGIN || "http://localhost:3000",
				),
			},
			build: {
				// Separate maps keep the service worker debuggable.
				sourcemap: true,
			},
		};
	},
});
