# Updraft development

Use Node 24 or newer. From the repo root:

```sh
npm ci
npm run preview
npm test
```

The preview at http://localhost:5180 uses in-memory Redis and seeded ghosts.
`npm test` checks types and formatting, runs the unit tests, and builds the client
and server. `npm run playtest` installs a build on a Reddit test community
using the Devvit CLI. `npm run publish` prepares and uploads a release for review.

## Local playtest results

At commit `4016986`, keyboard and touch emulation each completed five local
flight attempts through the result screen. The two current-day and two archived
attempts per viewport returned a server response. The fifth opened the archived
Nov 21 Lucky Ridge course with all API requests blocked and showed that the
leaderboard was unavailable. A separate blocked-API check on both viewports
opened the current-day course from its splash and reached the result screen.

One assisted finish per viewport used drag to launch and a scripted climb.
The local server replay saved both at 1,157 frames (19.28 seconds).
`npm test` passed all 65 tests, type checking, lint, and the production build.
[Local Devvit walkthrough](https://youtu.be/-eHnO1w_3ok)

## How the race works

Drag back from the plane and release to throw. Hold to pitch up and release to
glide. Space and Up Arrow work as keyboard controls. Thermals provide lift, rings
give a boost, and balloons slow the plane down. Each course has bronze, silver
and gold times.

[Shared simulation](../src/shared) handles the course, physics and par times.
The [Devvit server](../src/server) replays each input sequence before accepting
a time into Redis. [The client](../src/client) draws the race and ghosts on canvas.

The daily job posts at 00:01 UTC. Moderators can post on demand. Old posts keep
their own courses and leaderboards. Signed-out players can fly, and signing in
saves results. Streaks use Reddit flair, and players can share a time in a comment.

[Install the Reddit app](https://developers.reddit.com/apps/updraft-daily)
