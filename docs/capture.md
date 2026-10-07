# Capturing a lesson

The Chrome extension in [`apps/extension`](../apps/extension) records a Google
Meet call: the live captions and one mixed audio file of the call and the local
microphone. It is Chrome-only (Manifest V3, `tabCapture`, offscreen documents).
[WXT](https://wxt.dev) generates the manifest from
[`wxt.config.ts`](../apps/extension/wxt.config.ts); there is no `manifest.json`
in the source tree.

## Record a lesson

1. Open **Extension** (`/extension/connect`) in the website. The page hands the
   extension a Convex Auth token and shows "Extension connected".
2. Join a Meet call and turn captions on with the **CC** button. The extension
   reads Meet's caption panel; it does no speech recognition of its own. A
   "Verbatim" panel appears at the bottom right.
3. Click **Enable microphone** in the panel and allow the prompt in the tab that
   opens. The grant is for the extension's own origin, in a separate page,
   because Chrome does not show microphone prompts in offscreen documents.
   Without it the recording holds the other participant but not you.
4. Click the Verbatim toolbar icon once, in the Meet tab. Chrome allows tab
   capture only on a tab where the user has invoked the extension, and a click
   inside the injected panel does not count. The panel changes from "Click the
   Verbatim toolbar icon once to allow audio recording." to "Audio ready for the
   next lesson."
5. Click **Start lesson**, talk, then **Stop lesson**. While recording the panel
   says "Audio: this call and your microphone." and the toolbar icon carries a
   red **REC** badge. Tab capture mutes the tab, so the extension routes the
   captured audio back to your speakers.
6. The lesson appears on the dashboard. A finished lesson has status `ready`, an
   `audioStorageId`, an `audioDurationMs`, and an `audioOffsetMs`. Inspect them
   with `bunx convex data lessonSessions` from `packages/convex`.

## What the panel tells you

| Situation                                        | Behavior                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar icon not clicked before **Start lesson** | Captions are captured. The panel says "No audio: click the Verbatim toolbar icon to start recording this call." Clicking the icon then starts audio mid-lesson.                 |
| Audio started late                               | `audioOffsetMs` holds the gap between the lesson start and the first audio sample.                                                                                              |
| Lesson ends with no recording                    | The lesson is closed as `incomplete` instead of `ready`.                                                                                                                        |
| Upload fails                                     | The recording is kept, the panel offers **Retry saving audio**, and the lesson stays `processing` until it uploads.                                                             |
| Token expired                                    | The panel says "Sign-in expired. Reconnect to keep uploading." Its **Reconnect** button reopens `/extension/connect`. Captured lines stay queued and upload after reconnecting. |

## How it works

- **Starting.** **Start lesson** calls `lessonSessions.startSession`, which
  refuses unless both paired users have `standingConsent` set at that moment.
  See [auth.md](auth.md#consent).
- **Captions.**
  [`content/captions.ts`](../apps/extension/src/content/captions.ts) watches the
  caption panel and emits a row once its text settles. The service worker
  batches rows (up to 50, flushed every 4 seconds) into
  `transcriptLines.append`. Each row carries an `order`, and `append` skips an
  `order` that already exists, so a retried batch inserts nothing twice.
- **Audio.** The offscreen document
  ([`offscreen/recorder.ts`](../apps/extension/src/offscreen/recorder.ts)) mixes
  the tab stream and the microphone into one `MediaRecorder` stream at 32 kbps
  WebM/Opus, about 14 MB an hour. It buffers the whole lesson and uploads once
  on **Stop lesson**, through `generateAudioUploadUrl` and `attachAudio`.
- **Time.** `transcriptLines.startMs` and `endMs` share one origin with the
  recording: the instant the service worker starts the lesson. To seek the audio
  to a line, use `startMs - audioOffsetMs`. WebM written by `MediaRecorder`
  carries no duration, so `audioDurationMs` is stored on the session.
- **Token.** The token comes from the website's handoff and is never renewed by
  the extension. The service worker reads its `exp` claim
  ([`background/auth.ts`](../apps/extension/src/background/auth.ts)) and treats
  it as expired 30 seconds early.

## Configuration

| Variable         | Default                                        | Meaning                            |
| ---------------- | ---------------------------------------------- | ---------------------------------- |
| `WXT_CONVEX_URL` | `CONVEX_URL` from `packages/convex/.env.local` | Deployment the extension talks to. |
| `WXT_WEB_ORIGIN` | `http://localhost:3000`                        | Site that hands over the token.    |

`externally_connectable` in `wxt.config.ts` lists `http://localhost/*` only. Add
the site's production origin there and rebuild before using the extension
anywhere else.

If Meet's Content-Security-Policy interferes with the WXT dev server's reload
client, use `bun run build` and reload the extension in `chrome://extensions`.
