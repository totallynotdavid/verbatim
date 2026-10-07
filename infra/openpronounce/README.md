# OpenPronounce worker

Verbatim's retry scoring calls
[OpenPronounce](https://github.com/Halleck45/OpenPronounce) (MIT, CPU-only) over
HTTP. This directory holds the Modal deployment descriptor,
[`modal_app.py`](modal_app.py). The image is upstream's, built from upstream's
`Dockerfile` unmodified.

## What Convex expects

Convex expects three environment variables. Set them as described in
[docs/scoring.md](../../docs/scoring.md#setup).

| Variable               | Meaning                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENPRONOUNCE_URL`    | Base URL of the server. Convex posts to `<url>/pronunciation`. Unset turns the feature off: retry takes are not scored and nothing errors. |
| `OPENPRONOUNCE_KEY`    | Sent as the `Modal-Key` header.                                                                                                            |
| `OPENPRONOUNCE_SECRET` | Sent as the `Modal-Secret` header.                                                                                                         |

Convex sends one multipart request per retry take: `file` (a few seconds of
WebM/Opus), `expected_text` and `lang=en`. It never sends a lesson recording.
OpenPronounce loads the whole waveform and runs unchunked inference, so it needs
phrase-length audio.

## Deploy on Modal

```sh
git clone --depth 1 --branch v0.3.0 https://github.com/Halleck45/OpenPronounce.git
cp modal_app.py OpenPronounce/
cd OpenPronounce
modal deploy modal_app.py
```

The first deploy builds a roughly 6 GB image, because the upstream `Dockerfile`
downloads both Wav2Vec2 checkpoints at build time. Later deploys reuse it.

`modal deploy` prints the URL, which is `OPENPRONOUNCE_URL`. Create a token pair
under **Settings → Proxy Auth Tokens** in the Modal dashboard. The token id is
`OPENPRONOUNCE_KEY` and the secret is `OPENPRONOUNCE_SECRET`.

OpenPronounce has no authentication of its own. `modal_app.py` sets
`unauthenticated=False`, so Modal's proxy auth rejects a request without a valid
token pair before a container starts.

The server runs blocking inference inside async endpoints, so the descriptor
allows one request per container (`target_concurrency=1`) and at most two
containers (`max_containers=2`). A container stops 120 seconds after its last
request (`scaledown_window=120`), and gets 300 seconds to start
(`startup_timeout=300`).
