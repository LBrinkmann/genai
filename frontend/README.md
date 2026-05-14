# GenAI Chat Frontend

## Styling stack

Tailwind CSS v3 powers the chat surface (shell, messages, input, footer, legal
pages). Material-UI (MUI) v6 is retained for the feedback panel and any future
admin widgets, restyled via the dark zinc theme.

The build runs through CRACO so we can pass `css-loader { url: false }` —
required because Tailwind v3's preflight references font URLs that CRA's
default loader tries (and fails) to resolve. See `craco.config.js`.

## Static media assets

Large binaries (looping background video, etc.) are **not** committed to the
repo. `frontend/public/.gitignore` excludes `*.mp4` and `*.mov`; the poster
image (`bg-video-poster.jpg`) and SVG line art are tracked because they're
small.

Pull the media down from the production server before building locally or
deploying:

```bash
.claude/skills/hetzner/hcloud.sh pull-assets gen-ai-server-1
```

This rsyncs `/var/www/genai/public/*.{mp4,mov,svg}` into
`frontend/public/`. The dev server and the Docker build both expect the video
files to be present.

## Mock Mode (no backend required)

Run the frontend standalone with canned bot responses — no backend, database, or API keys needed.

```bash
cd frontend
npm install
REACT_APP_MOCK_API=true npm start
```

Or copy the provided env file:

```bash
cp .env.mock .env.local
npm start
```

Open [http://localhost:3000](http://localhost:3000). The mock provides:
- A single bot ("Alpha") with varied canned responses
- Simulated network latency (300–1200ms)
- Working session management, feedback, and health indicators
- Edit `src/services/mockApi.js` to add a second bot for RLHF comparison mode

To switch back to the real backend, remove `.env.local` or set `REACT_APP_MOCK_API=false`.

## Admin login

The chat surface is open to participants; a small admin UI lives behind a
cookie-session login. Open it from the gear menu in the top-right corner →
**Log in**. Once authenticated the same menu exposes:

- **Reset conversation** — clears the current session's messages.
- **LLM endpoint controls** — one row per bot that has an `llm_endpoint`
  block in `config/experiment.yml`. Each row shows the current state and a
  Start or Stop button. Stop opens an inline two-step confirmation since
  pausing disconnects any active users.
- **Log out** — clears the cookie.

### Dev mode (mock API)

In mock mode (`REACT_APP_MOCK_API=true`) any username works and any password
**except the literal `wrong`** succeeds — `wrong` is a test hook that
returns 401 so the error path can be exercised. The mock LLM endpoint state
cycles automatically (`paused → resuming → running → pausing → paused`) so
Start/Stop transitions are visible without a real HF endpoint.

### Production mode

The operator generates `ADMIN_PASSWORD_HASH` once via the backend helper
(`backend/scripts/hash_password.py`) and sets it together with
`ADMIN_USERNAME` and `SESSION_SECRET` in the server's `.env`. See
`doc/operator-migration-admin-login.md` for the full runbook.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
