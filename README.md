# Spotify Lite

Spotify Lite is a tiny static web app that shows only a curated set of podcasts and playlists from Spotify.

## Files

- `index.html`: app shell and setup instructions
- `styles.css`: dark mobile-first UI
- `app.js`: Spotify fetch logic, grouping, caching, and Cloudflare token loading
- `config.js`: token endpoint, podcast IDs, and playlist IDs
- `manifest.json`: PWA metadata
- `service-worker.js`: static asset caching
- `cloudflare-worker.js`: secure Spotify token proxy for Cloudflare Workers
- `wrangler.toml`: Cloudflare Worker config

## Recommended setup

1. Keep `SPOTIFY_ACCESS_TOKEN` empty in `config.js`.
2. Deploy the Cloudflare Worker in this folder.
3. Put the deployed Worker `/token` URL into `SPOTIFY_TOKEN_ENDPOINT` in `config.js`.
4. Deploy the static files to GitHub Pages or Cloudflare Pages.

## Cloudflare Worker setup

1. Install Wrangler if you do not already have it:

```bash
npm install -g wrangler
```

2. Log in to Cloudflare:

```bash
wrangler login
```

3. From this project folder, add your Spotify secrets:

```bash
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
```

4. Deploy the Worker:

```bash
wrangler deploy
```

5. Copy the deployed Worker URL and append `/token`.

Example:

```text
https://spotify-lite-token.your-subdomain.workers.dev/token
```

6. Paste that URL into `SPOTIFY_TOKEN_ENDPOINT` in `config.js`.

## Local usage

1. Add your Cloudflare Worker `/token` URL to `config.js`.
2. Keep your Spotify client secret out of the frontend.
3. Open `index.html` directly in a browser for a simple no-build preview.

## Deploying the static site

### GitHub Pages

1. Push this folder to a GitHub repository.
2. Open `Settings -> Pages`.
3. Choose `Deploy from a branch`.
4. Select the branch and root folder.
5. Save and wait for the site to publish.

### Cloudflare Pages

1. Create a new Pages project in Cloudflare.
2. Point it at your GitHub repository.
3. Set the build command to blank and the output directory to the project root.
4. Deploy.

## Notes

- The app uses the Spotify Web API endpoints:
  - `GET /v1/shows/{id}/episodes`
  - `GET /v1/playlists/{id}`
- The Cloudflare Worker fetches and reuses Spotify app tokens so you do not have to regenerate them manually.
- API responses are cached in `localStorage` for 15 minutes to keep repeat loads fast.
- The service worker caches static assets for offline shell loading.
