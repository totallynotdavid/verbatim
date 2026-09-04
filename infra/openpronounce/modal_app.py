"""Deploy OpenPronounce's own container on Modal, unmodified.

Verbatim needs phoneme-level pronunciation scoring and there is no hosted
OpenPronounce anywhere, so this deployment is a setup step a human has to do
once. Nothing here is a fork: the image is built from the upstream `Dockerfile`
exactly as it ships, and the only code is the few lines that start the server
the image already contains.

Why Modal rather than Fly.io Machines, which would also scale to zero: the
OpenPronounce server has no authentication of its own, so whatever hosts it has
to be the thing that gates it. Modal's proxy auth does that in front of the
container, before one is even started, with no proxy of ours to write and
maintain. See README.md in this directory for the Fly.io alternative and what it
would cost you.

Deploy:

    git clone --depth 1 --branch v0.3.0 \
        https://github.com/Halleck45/OpenPronounce.git
    cp modal_app.py OpenPronounce/
    cd OpenPronounce && modal deploy modal_app.py

The first deploy builds a ~6 GB image (the Dockerfile downloads both Wav2Vec2
checkpoints at build time so the container starts fast and needs no warm cache),
which takes a while. Later deploys reuse it.
"""

import os
import subprocess

import modal

PORT = 8000

# Use the Dockerfile from the OpenPronounce checkout.
image = modal.Image.from_dockerfile(
    os.environ.get("OPENPRONOUNCE_DOCKERFILE", "Dockerfile")
)

app = modal.App("verbatim-openpronounce")


@app.server(
    image=image,
    port=PORT,
    # Two cores and memory for both model checkpoints plus torch.
    cpu=2,
    memory=8192,
    # Inference blocks the async server, so keep one request per container.
    target_concurrency=1,
    # Cap spend at two containers for this one-at-a-time workload.
    max_containers=2,
    # Stop billing after two idle minutes; checkpoints are baked into the image.
    scaledown_window=120,
    startup_timeout=300,
    # Modal proxy auth gates the public server; Convex supplies the credentials.
    unauthenticated=False,
)
class OpenPronounce:
    @modal.enter()
    def start(self) -> None:
        # Start the image entrypoint because @app.server owns the lifecycle.
        subprocess.Popen(
            ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", str(PORT)],
            cwd="/app",
        )
