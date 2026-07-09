# Michigan Head & Neck Navigator

This repository contains a static HTML prototype centered on:

- `Michigan_HeadNeck_Navigator.html`

## Current state

- The GitHub repository is connected and includes the current app history.
- `index.html` is the GitHub Pages entry point and redirects into the main app.
- `Michigan_HeadNeck_Navigator.html` is the main static app.
- `design-gallery.html` links to three design concept pages for comparing visual directions.
- `App.js` is a separate React Native / Expo prototype and is not wired into the static site.
- `server.mjs` is a small local backend that keeps the OpenAI API key off the frontend.

## Safe AI integration

The HTML app now supports a safe AI flow:

- The browser builds prompts and reviews pasted AI answers.
- The backend calls the OpenAI Responses API.
- The API key stays on the server and should never be pasted into the HTML or browser console.

### Local setup

1. Create a `.env` file from `.env.example`.
2. Add your OpenAI key:

```bash
OPENAI_API_KEY=your_key_here
```

3. Optional: choose a model.

```bash
OPENAI_MODEL=gpt-5.5
```

4. Start the backend:

```bash
npm run dev
```

5. Open the app and keep the AI server URL set to `http://localhost:8787`.

### GitHub Pages note

GitHub Pages can host the frontend, but it cannot safely hold a secret API key.

If you want the live GitHub Pages site to use AI, deploy `server.mjs` to a small backend host first, then paste that HTTPS backend URL into the app's AI server field.

Good options:

- Netlify functions
- Vercel
- Render
- Railway

## Next cleanup option

At some point you may still want to decide whether `App.js` should stay in this repository or move to a separate mobile app project.
