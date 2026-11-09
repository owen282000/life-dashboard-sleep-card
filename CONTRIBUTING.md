# Contributing

Thanks for your interest in improving the Life Dashboard Sleep Card.

## Getting started

The card is one JavaScript file with no dependencies and no build step: `dist/life-dashboard-sleep-card.js`.

```sh
npm test
node test/render.mjs /tmp/sleep-card
```

`npm test` runs the data logic under Node. `test/render.mjs` needs Google Chrome: it opens the fake Home Assistant in `test/harness.html`, runs the browser checks in a light and a dark theme, and writes screenshots to the folder you give it.

## What a change should keep

- One file, no dependencies, no build step.
- Every value that comes from a sensor is set as text or escaped.
- A sensor that is missing, unavailable or malformed shows an empty state, never a broken card.
- Identity is never color alone: lane position and labels carry it too.
- Sample data only in fixtures and screenshots, no real health data.

## Commits and pull requests

Commit messages and pull request titles follow `type: Sentence with a capital`, such as `fix: Keep the hour ticks inside the plot`. Add a line under `## [Unreleased]` in `CHANGELOG.md` when a user would notice the change.

## Where things belong

The card only draws. Sensors, statistics and the night chart image are in the [integration](https://github.com/owen282000/life-dashboard-ha), and syncing is in the phone apps.
