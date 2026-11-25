# Updraft

**A daily race needs a course everyone can play and a time everyone can trust.**

<img src="docs/preview.jpg" width="640" alt="Updraft paper plane ready to launch on the daily course">

Updraft is a paper-plane race inside Reddit. Ride thermals, hit boost rings, and
race your best ghost or the fastest pilots on the day's course.

## How to play

1. Open the day's post in [the demo subreddit](https://www.reddit.com/r/updraft_daily_dev/) and choose **Throw** or **Chase**.
2. Drag back from the plane and release to launch. Hold to climb and release to glide. Space and Up Arrow also launch and climb.
3. Use thermals for lift and boost rings for speed. Avoid balloons and fly through the finish gate to set a time.

You can fly as a guest. Sign in to save your time and ghost.

## How it uses Devvit

Devvit Web puts the race inside a Reddit post. A scheduled job posts the daily
course, and Devvit Redis stores times, ghosts, and streaks. The server replays the
same flight inputs before recording a leaderboard time.

## Quickstart

From a fresh clone with Node 24 or newer:

```sh
npm ci && npm run preview
```

Open http://localhost:5180 for a local race with seeded ghosts.

[Play on Reddit](https://www.reddit.com/r/updraft_daily_dev/) ·
[Video](https://youtu.be/KKe-zw4jUCc) · [Devpost](https://devpost.com/software/updraft-vjakg5) ·
[Development](docs/development.md) · [BSD 3-Clause](LICENSE)
