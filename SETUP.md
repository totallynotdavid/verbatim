# Setup

This takes a fresh clone to a working dev server and a loaded extension. You
need [Bun](https://bun.sh), Chrome, a [Convex](https://convex.dev) account and a
Google Cloud project.

## 1. Install dependencies

```sh
bun install
```

## 2. Create the Convex deployment

The Convex project lives in `packages/convex`, not the repository root.

```sh
cd packages/convex
bunx convex dev --once
```

The first run opens a browser to log in and create or pick a project. It then:

- writes `packages/convex/.env.local` with `CONVEX_DEPLOYMENT` and `CONVEX_URL`
  (`https://<name>.convex.cloud`);
- writes `packages/convex/convex/_generated/`, the typed API that the website
  and the extension import. Git ignores the directory;
- pushes `convex/schema.ts` and the functions once, and exits.

`bun run dev` in step 6 starts the watching `convex dev`, so do not leave
another one running. `bun run typecheck` and `bun run build` need `_generated`,
so run this step first on a fresh clone. Once a deployment is configured,
`bunx convex codegen` writes the directory without pushing.

## 3. Create the Google OAuth client

Google is the only sign-in method.

1. In [Google Cloud Console](https://console.cloud.google.com/) open **APIs &
   Services → Credentials → Create Credentials → OAuth client ID → Web
   application**.
2. Add this **Authorized redirect URI**:

   ```text
   https://<name>.convex.site/api/auth/callback/google
   ```

   The host is the deployment's HTTP Actions URL: the same name as the
   `.convex.cloud` URL, with `.convex.site`. It is on the deployment's Settings
   page in the Convex dashboard.

3. Copy the **Client ID** and **Client secret**.

## 4. Set the Convex environment

From `packages/convex`:

```sh
bunx convex env set AUTH_GOOGLE_ID <client-id>
bunx convex env set AUTH_GOOGLE_SECRET <client-secret>
bunx convex env set SITE_URL http://localhost:3000
```

`SITE_URL` is the website's origin. Convex Auth validates sign-in redirects
against it and the audio routes use it as their CORS origin. Set it to the
production origin when you deploy.

## 5. Point the website at the deployment

Create `apps/web/.env.local`:

```sh
NEXT_PUBLIC_CONVEX_URL=https://<name>.convex.cloud
```

## 6. Run it

```sh
bun run dev
```

This runs `dev` in every workspace that defines it: `convex dev`, `next dev` and
`wxt`. Open `http://localhost:3000`, sign in with Google, pick **tutor** or
**student** (the role cannot be changed afterwards), and pair the two accounts:
one generates an invite code on the pairing page, the other enters it. Each
person then turns on recording consent under **Settings**.

## 7. Load the extension

```sh
cd apps/extension
bun run build
```

In Chrome open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select `apps/extension/.output/chrome-mv3`. Pin **Verbatim
Capture** to the toolbar. Recording starts from that icon.

The extension ID is fixed by the `key` in
[`apps/extension/wxt.config.ts`](apps/extension/wxt.config.ts) to
`lekedgolgpdocenlpjgmmcbmgphjmjje`. The website sends the extension its token to
that ID, so Chrome must show the same one.

The build reads the Convex URL from `packages/convex/.env.local`. Set
`WXT_CONVEX_URL` or `WXT_WEB_ORIGIN` to point it elsewhere. Off `localhost`, add
the site's origin to `externally_connectable` in the same config file.

## 8. Record a first lesson

1. Open **Extension** in the website's sidebar. It should say "Extension
   connected".
2. Join a Meet call and turn captions on.
3. Click the Verbatim toolbar icon once in the Meet tab, then **Start lesson**
   in the panel at the bottom right.
4. Stop the lesson. It appears on `/dashboard` with status `ready`.

[docs/capture.md](docs/capture.md) explains each step and what the panel says
when one is missed.

## Optional: pronunciation workers

The lesson analysis and retry scoring need a Replicate token, a deployed
OpenPronounce and a shared secret. Without them the rest of the product works
and those two features stay off. See [docs/scoring.md](docs/scoring.md).
