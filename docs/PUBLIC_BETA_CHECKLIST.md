# RedGlitch Public Beta Checklist

Use this checklist before tagging or sharing a public beta build.

## Release Target

- Platform: macOS desktop app
- Entry point: `dashboard.html`
- Default project: `Default Project`
- Beta promise: open a project, use the studio tools, play a bundled demo, save/reload without a crash

## Required Commands

Run these from the repo root:

```bash
npm run beta:check
```

This runs:

- server route tests
- engine and campaign runtime tests
- Vite studio production build

## Manual Smoke Test

1. Start the app with `npm start`.
2. Confirm the dashboard opens without a blank screen.
3. Click **Open Beta Project** or open `Default Project` from My Projects.
4. Confirm the Studio opens after the project switch.
5. Open Command Center.
6. Open one stable editor from the sidebar.
7. Launch the bundled playable demo path.
8. Play for at least two minutes.
9. Save or trigger the available save flow.
10. Quit and reopen the app.
11. Confirm the same project still loads.

## Package Smoke Test

1. Run `npm run beta:build:mac`.
2. Open the generated macOS app from `dist/`.
3. Repeat the manual smoke test from the packaged app, not the dev checkout.
4. Confirm no required beta path depends on a local dev server that is not bundled or started by Electron.

## Must Fix Before Public Sharing

- Blank or permanently loading first screen.
- Default project missing or unable to switch.
- Playtest starts in an unplayable state, including void fall, missing spawn, or missing terrain collision.
- Save/load corruption in the default beta path.
- Missing required runtime assets for the default project.
- App crash during launch, project switch, playtest, or quit/reopen.

## Allowed Beta Limitations

These can ship if they are clearly labeled experimental:

- local AI model setup
- mobile export
- DAW
- campaign authoring
- advanced 3D editor features
- shader authoring beyond the demo presets

## Generated Assets Policy

`npm run studio:build` writes `public/studio-dist`. Treat those files as release artifacts: include them only when intentionally preparing a beta build, and avoid mixing unrelated source edits with generated asset hash churn.
