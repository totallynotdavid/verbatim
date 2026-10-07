# Sign-in, pairing and access

## Sign-in

Google is the only provider
([`packages/convex/convex/auth.ts`](../packages/convex/convex/auth.ts)). Convex
Auth serves the OAuth callback from the deployment's `.convex.site` host, and
validates the post-sign-in redirect against the `SITE_URL` environment variable.
[SETUP.md](../SETUP.md) covers the credentials.

[`apps/web/src/middleware.ts`](../apps/web/src/middleware.ts) redirects an
unauthenticated visitor on `/app`, `/onboarding/*`, `/dashboard/*` and
`/extension/*` to `/`, and a signed-in visitor on `/` to `/app`. `/app` then
routes to role selection, pairing, or the dashboard, depending on what the user
has finished.

## Roles and pairing

- A user picks `tutor` or `student` once (`users.setRole`). A second call is
  refused.
- One user generates a six-character invite code (`users.createPairingInvite`).
  The other enters it (`users.acceptPairingInvite`). Codes use an alphabet
  without look-alike characters, and redemption clears the code.
- A pair is exactly one tutor and one student. Redeeming your own code, reusing
  a code, or pairing two users of the same role is refused.

## Consent

Each user has a `standingConsent` flag, toggled under **Settings**
(`users.setStandingConsent`). `lessonSessions.startSession` reads both flags at
call time and refuses to create a lesson unless both are true. The lesson stores
both values as `consentTutor` and `consentStudent`, so later changes to the flag
do not alter an existing lesson.

## Who can read and write what

Every function that touches a lesson resolves the signed-in user with
`getAuthUserId` and checks them against the lesson. The helpers are in
[`model/sessions.ts`](../packages/convex/convex/model/sessions.ts).

| Helper                 | Rule                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| `isSessionMember`      | The user is the lesson's `tutorId` or `studentId`.                              |
| `requireOwnSession`    | Signed in and a member of the lesson.                                           |
| `requireSessionTutor`  | A member who is the lesson's `tutorId`.                                         |
| `requireTutor`         | A signed-in user whose `role` is `tutor`, for content that is outside a lesson. |
| `requireOwnReviewCard` | The card's lesson passes `requireOwnSession`.                                   |

Both members can read everything in a lesson. Both can write notes, and a note
can be edited or deleted only by its author. Only the lesson's tutor can tag
interview segments, write rubrics, or run and review the lesson analysis. A
retry take can be deleted only by whoever recorded it.

The question bank is outside any lesson. `interviewQuestions.list` needs only a
signed-in user, so a student reads the whole bank. `interviewQuestions.create`,
`update` and `remove` call `requireTutor`.

The web UI hides controls the backend would refuse. The backend check is the
rule.

## Recording audio

Lesson and retry recordings are never exposed through a Convex storage URL. Two
HTTP actions in [`http.ts`](../packages/convex/convex/http.ts) stream the bytes:

```text
GET https://<deployment>.convex.site/lessonAudio?sessionId=<id>
GET https://<deployment>.convex.site/retryAudio?retryId=<id>
Authorization: Bearer <Convex Auth token>
```

Both are registered by `routeStoredAudio` and use `authorizeStoredFile`, so the
membership check runs on every request against the caller's own token. A retry's
lesson is found through its review card.

| Status | Cause                                                    |
| ------ | -------------------------------------------------------- |
| 400    | The id parameter is missing.                             |
| 401    | No token, or a token Convex does not accept.             |
| 403    | Signed in, but not a member of the lesson.               |
| 404    | Unknown or malformed id, or the lesson has no recording. |

The responses carry `Cache-Control: private, max-age=3600`. The CORS origin is
`SITE_URL`, or `*` when it is unset. A `SITE_URL` that does not match the site's
real origin lets users sign in but breaks audio playback.

The browser passes the token from `useAuthToken()` (`@convex-dev/auth/react`).
That hook returns a value only because
[`layout.tsx`](../apps/web/src/app/layout.tsx) wraps the app in
`ConvexAuthNextjsServerProvider`.
[`use-clip-player.ts`](../apps/web/src/lib/use-clip-player.ts) keeps the token
in a ref and keys its download on whether a token exists, so token rotation does
not restart a download.

Convex limits an HTTP action response to 20 MB. At the extension's 32 kbps that
is roughly 85 minutes of audio, which is the longest lesson `/lessonAudio` can
serve.

## Worker routes

`/scoring/audio` and `/scoring/whisperx` are called by Replicate, not by a
signed-in user. Their authorization is described in
[scoring.md](scoring.md#worker-authorization).

## The extension's token

The extension holds a copy of the user's Convex Auth token, handed over by
`/extension/connect`. See [capture.md](capture.md).
