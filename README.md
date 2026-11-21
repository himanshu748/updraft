# Updraft

A daily paper-plane race on Reddit, built with Devvit Web for the Reddit Game of the Day 2026 hackathon.

Every day there is one hand-tuned wind course: thermals, wind bands, boost rings and drifting balloons over rolling hills. Throw your plane, keep it in the air, and race the ghosts of everyone who flew today. The course never changes during the day; you just get faster.

## Play it

- Demo subreddit: [r/updraft_daily_dev](https://www.reddit.com/r/updraft_daily_dev/) (a new course is posted there every day at 00:01 UTC)
- App listing: [developers.reddit.com/apps/updraft-daily](https://developers.reddit.com/apps/updraft-daily)

Open the day's post and press **Throw** (or **Beat your ghost** once you have a time).

## How to play

- **Throw:** drag back from the plane (like a slingshot) and let go. The dotted arc previews your throw.
- **Fly:** hold anywhere to pull the nose up and climb; let go and the plane settles into a glide.
- Ride thermals (warm columns) for height, fly through rings for speed, and dodge the balloons.
- Reach the finish gate as fast as you can. Gold, silver and bronze par times are set from the day's course.
- Keyboard: Space or Up arrow throws and climbs.

## Reddit-native bits

- A new course post every day (scheduled at 00:01 UTC), plus a moderator menu item to post it on demand.
- Old posts keep their own course and leaderboard, so any day can be replayed.
- Ghosts of today's fastest pilots and your own best fly alongside you.
- Daily leaderboard, "faster than N% of pilots", streaks with user flair, and a one-tap comment with your time.
- Logged-out players can fly every course; logging in saves times and ghosts.

## Fair times

Runs are deterministic: the client sends only the throw and the frames where you pressed or let go. The server replays that input through the same simulation (`src/shared/sim.ts`) and records the time it computes, so a time on the board is a time that was actually flown, and that same input drives your ghost.

## Development

```sh
npm install
npm run preview    # local browser preview with in-memory Redis and seeded ghosts: http://localhost:5180
npm test           # types, lint, unit tests
npm run playtest   # build, upload and install on your test subreddit
npm run publish    # upload a new version for review
```

Code layout: `src/shared` (course generator, flight sim, autopilot that sets par times), `src/server` (Devvit server routes and Redis storage), `src/client` (canvas renderer, game and splash screens), `public` (HTML and CSS).

No microphone, camera or recorded media are used. Sounds are synthesized in the browser.

## License

BSD-3-Clause, based on Reddit's Devvit bare template.
