# OpenPronounce worker

Verbatim's phoneme-level scoring calls
[OpenPronounce](https://github.com/Halleck45/OpenPronounce) (MIT, CPU-only) over
HTTP. There is no hosted OpenPronounce anywhere, so somebody has to deploy the
container it ships. This directory holds the deployment descriptor and nothing
else — the image is upstream's, built from upstream's `Dockerfile`, unmodified.

## What Convex expects

Three environment variables on the Convex deployment (see `SETUP.md` step 9):

| Variable | Meaning |
|---|---|
| `OPENPRONOUNCE_URL` | Base URL of the server. Convex posts to `<url>/pronunciation`. **Unset means the feature is off** — retry takes are simply not scored, and nothing errors. |
| `OPENPRONOUNCE_KEY` | Sent as the `Modal-Key` header. |
| `OPENPRONOUNCE_SECRET` | Sent as the `Modal-Secret` header. |

Convex sends one multipart request per retry take: `file` (a few seconds of
WebM/Opus), `expected_text`, and `lang=en`. It never sends a lesson recording —
OpenPronounce loads the whole waveform and runs unchunked inference, so a
lesson-length file would be both wrong and expensive.

## Modal (recommended)

```sh
git clone --depth 1 --branch v0.3.0 https://github.com/Halleck45/OpenPronounce.git
cp modal_app.py OpenPronounce/
cd OpenPronounce
modal deploy modal_app.py
```

The first deploy builds a ~6 GB image — the upstream `Dockerfile` downloads both
Wav2Vec2 checkpoints at build time, which is what lets a cold container answer
without a model download. Expect ten-ish minutes once, then seconds.

`modal deploy` prints the URL; that is `OPENPRONOUNCE_URL`. Create the token pair
with **Settings → Proxy Auth Tokens** in the Modal dashboard, and put the id in
`OPENPRONOUNCE_KEY` and the secret in `OPENPRONOUNCE_SECRET`.

Why Modal: the OpenPronounce server has **no authentication of its own**. It is a
FastAPI app with open endpoints, including a text-to-speech one. Anything that
hosts it on a public URL has to be the thing that gates it, and Modal's proxy
auth does that in front of the container — an unauthenticated request never
starts one. It also scales to zero on its own, which for a workload of a handful
of retry takes a week is the difference between cents and a monthly bill.

`modal_app.py` sets `target_concurrency=1` deliberately: the server performs
blocking inference inside async endpoints, so it is not internally concurrent.
One request per container, and `max_containers=2` as the ceiling on spend.

## Fly.io Machines (alternative)

Fly Machines also scale to zero (`min_machines_running = 0` with
`auto_stop_machines = "stop"`), and `fly launch --dockerfile Dockerfile` inside
the same checkout will deploy this image as-is. Set
`[http_service.concurrency] type = "requests"`, `hard_limit = 1`, `soft_limit = 1`
for the same one-worker-per-instance rule, and give the machine at least 4 GB.

The catch is the one above: Fly has no request authentication in front of your
app, so a Fly deployment is a public, unauthenticated inference endpoint unless
you put something in front of it. Fly's private networking (`.flycast`, 6PN) is
not reachable from Convex, so that is not the way out either. If you go this
route, plan on a small reverse proxy that checks a shared header — at which
point you are maintaining a component that the Modal path does not need.

## Cost

CPU seconds only, and only while a request is in flight plus the scaledown
window. A retry take is a few seconds of audio and a few seconds of inference,
so a lesson's worth of retries is a fraction of a cent. This is not the
cost-bearing half of Phase 5; the GPU transcription on Replicate is.
