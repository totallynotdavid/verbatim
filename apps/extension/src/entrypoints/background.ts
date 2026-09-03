import { defineBackground } from "wxt/utils/define-background";
import { registerBackground } from "../background/service";

export default defineBackground({
	// Convex and the future offscreen recorder both need module scope.
	type: "module",
	main() {
		registerBackground();
	},
});
