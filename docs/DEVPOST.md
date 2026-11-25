# Updraft — Devpost submission draft

**Tagline:** Throw a paper plane through a new wind course every day, and race the ghost of every pilot who flew before you.

## Inspiration

Paper planes are the universal lobby-game — everyone has thrown one, everyone has opinions about why theirs nosedived. A daily wind course turns that into a shared ritual: same sky for everyone, one day only, and the course never changes while you chase the leaders.

## What it does

Every day at 00:01 UTC a new hand-tuned wind course posts to the subreddit: thermals, wind bands, boost rings and drifting balloons over rolling hills. Slingshot your plane, surf thermals for height, thread rings for speed, dodge balloons, and reach the finish gate fast. Gold/silver/bronze pars come from the course itself.

The hook is the ghosts: today's fastest pilots and your own best run fly alongside you in real time. Old posts keep their own course and leaderboard forever, so any day is replayable. Daily leaderboard with "faster than N% of pilots", streaks with user flair, one-tap comment sharing. Logged-out players can fly every course; logging in saves times and ghosts.

## How we built it

Devvit Web Interactive Post. The critical decision: **fair times by deterministic replay**. The client sends only the throw vector and the frames where the player pressed or released — the server replays that input through the same simulation (`src/shared/sim.ts`) and records the time it computes. A time on the board is a time that was actually flown, and the same input drives your ghost. React client, Redis for leaderboards/streaks/flair, scheduled daily posting plus a moderator post-on-demand menu item.

## Challenges we ran into

- Making a plane feel like a plane in two controls (throw + hold-to-climb): enough physics to reward skill, forgiving enough for a 30-second daily session.
- Ghost integrity: ghosts must be the actual recorded inputs, or the magic of racing real people is a lie.
- Course design tooling: hand-tuned courses need a fast iteration loop to hit daily quality.

## Accomplishments we're proud of

The ghost race is real. Not a replay of positions — a replay of inputs, verified server-side, racing you today. Also: a full daily loop (post, play, leaderboard, streaks, flair, comments) with zero manual operation.

## What's next for Updraft

Head-to-head ghost challenges in comments, weekly championship courses, community-designed courses.

## Built with

`devvit` `devvit-web` `react` `typescript` `redis` `reddit` `canvas`

## Links

- App listing: https://developers.reddit.com/apps/updraft-daily
- Demo subreddit: https://www.reddit.com/r/updraft_daily_dev/
- Repository: https://github.com/himanshu748/updraft
- [Published Devpost entry](https://devpost.com/software/updraft-vjakg5)
- [YouTube demo linked on Devpost](https://youtu.be/KKe-zw4jUCc)
- [Newer gameplay clip](demo-video.mp4): the par-pilot autopilot flies the local client in offline mode. This clip does not show a saved Reddit leaderboard result.
