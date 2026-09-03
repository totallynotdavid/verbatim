/** ID used by the web handoff for the default unpacked extension build. */
export const EXTENSION_ID =
	process.env.NEXT_PUBLIC_VERBATIM_EXTENSION_ID ??
	"lekedgolgpdocenlpjgmmcbmgphjmjje";

/** The subset of `chrome.runtime` a normal web page is allowed to see. */
export type ExternallyConnectableChrome = {
	runtime?: {
		sendMessage?: (
			extensionId: string,
			message: unknown,
			callback: (response: unknown) => void,
		) => void;
		lastError?: { message?: string };
	};
};
