# Updraft — Devpost submission draft

**Tagline:** Throw a paper plane through a new wind course every day, and race the ghost of every pilot who flew before you.

## Inspiration

Paper planes are the universal lobby-game — everyone has thrown one, everyone has opinions about why theirs nosedived. A daily wind course turns that into a shared ritual: same sky for everyone, one day only, and the course never changes while you chase the leaders.

## What it does

Every day at 00:01 UTC, a scheduled job posts a new wind course to the subreddit. The date seeds a course with thermals, wind bands, boost rings, and drifting balloons. Slingshot your plane, surf thermals for height, thread rings for speed, dodge balloons, and reach the finish gate fast. Gold, silver, and bronze pars come from the course itself.

Today's fastest pilots and your own best run fly alongside you as ghosts. Older posts retain their course and leaderboard. Daily results show your rank, streak, and how much of the field you beat. You can fly as a guest or sign in to save your time and ghost and share a result in the comments.

## How we built it

Updraft uses Devvit Web, a TypeScript Canvas client, and Devvit Redis. The client sends the throw vector and the frames where the player pressed or released. The server replays those inputs through the same simulation (`src/shared/sim.ts`) and records the time it computes. The same inputs drive the ghost. A scheduled job posts the daily course, and moderators can post it on demand.

## Challenges we ran into

- Making a plane feel like a plane in two controls (throw + hold-to-climb): enough physics to reward skill, forgiving enough for a 30-second daily session.
- Ghost integrity: ghosts must be the actual recorded inputs, or the magic of racing real people is a lie.
- Course generation needs to keep a daily route playable. An autopilot checks a course before the game uses it and sets its par times.

## Accomplishments we're proud of

The ghost race is real. Not a replay of positions — a replay of inputs, verified server-side, racing you today. Also: a full daily loop (post, play, leaderboard, streaks, flair, comments) with zero manual operation.

## What's next for Updraft

Head-to-head ghost challenges in comments, weekly championship courses, community-designed courses.

## Built with

`devvit` `devvit-web` `typescript` `redis` `reddit` `canvas`

## Links

- App listing: https://developers.reddit.com/apps/updraft-daily
- Demo subreddit: https://www.reddit.com/r/updraft_daily_dev/
- [Submitted Reddit post](https://www.reddit.com/r/updraft_daily_dev/comments/1y1itqc/updraft_nov_21_lucky_ridge_starlit_saturday/) · [Mobile judge check](development.md#mobile-judge-check)
- Repository: https://github.com/himanshu748/updraft
- [Published Devpost entry](https://devpost.com/software/updraft-vjakg5)
- [Original Reddit demo](https://youtu.be/KKe-zw4jUCc)
- [Local Devvit walkthrough (0:57)](https://youtu.be/-eHnO1w_3ok). A scripted climb reaches the finish and the local server verifies the time. The phone-width replay opens the Nov 21 archived course with its API requests blocked. The walkthrough uses in-memory Redis.
- [Archived offline gameplay clip](demo-video.mp4). The par pilot completes the course in the offline local client.
