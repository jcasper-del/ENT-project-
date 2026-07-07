# Michigan Head & Neck Navigator

This repository currently contains a static HTML prototype centered on:

- `Michigan_HeadNeck_Navigator.html`

## Current state

- The GitHub repository exists, but it does not have an initial commit yet.
- `index.html` is the GitHub Pages entry point and redirects into the main app.
- `Michigan_HeadNeck_Navigator.html` is the main static app.
- `App.js` is a separate React Native / Expo prototype and is not wired into the static site.

## First review path

1. Make the initial commit with the static HTML app and supporting files.
2. Decide whether `App.js` should stay in this repository or move to a separate mobile app project.
3. Enable GitHub Pages after the first push so `index.html` can redirect into the main app.

## Deployment note

GitHub Pages works well for the current static version.

If you later need live study data, private spreadsheets, user accounts, or AI calls with secure API keys, the next step should be:

- GitHub for source control
- Netlify or Vercel for hosting
- a small backend or serverless function for protected data or API access
