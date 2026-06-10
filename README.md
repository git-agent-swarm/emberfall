# 🔥 EMBERFALL

**A momentum action-platformer that lives inside Reddit posts.**

Run, float, dash, and ground-pound through a glowing ember-lit course. Every day,
your whole community gets the **exact same course** — generated deterministically
from a server seed — so the daily leaderboard is a straight, fair fight. Chain
dash-kills, bank embers, and chase the champion's ghost.

The world isn't random set-dressing either: the day's **top Reddit posts are baked
into the level as glowing monuments** — post score sets each monument's height,
comment count sets its glow, and the day's palette is re-graded from the top
post's thumbnail. The community literally shapes the terrain.

---

## How it plays

- **Jump** — `Space`/`W` (hold to float, press again mid-air to double-jump)
- **Dash** — `Shift`/`K`, aim with arrows (or drag on the right half of the screen)
- **Ground-pound** — `S`/`Down`
- One run, one score. **Daily mode** (same course for everyone, streaks) or
  **endless mode** (it keeps generating until you fall).
- Dash through hazards to build **kill chains**; collect **motes** to unlock cosmetics.
- Beat the day's top score and the next players race **your ghost**.

## Try it locally

```bash
bash play.sh
```

Builds the game, serves it on localhost, and opens it in Chrome — fully standalone
(no Devvit server needed; it falls back to a default course). Keyboard or mouse.

## How it's built

| Layer | What's there |
| --- | --- |
| **Client** | Custom WebGL engine (Pixi) — `src/client/engine/`: deterministic level generation, particles, camera feel, dynamic audio, input buffering, quality scaling. All real-time simulation runs client-side. |
| **Server** | Devvit serverless (Node 22, Hono + tRPC v11) — issues the daily seed, bakes monuments from real posts (with slur/NSFW filtering), validates submitted runs for plausibility, owns leaderboards + champion ghosts. |
| **Data** | Redis per-installation — daily courses, user stats (best score, combos, chains, streaks), leaderboards, cosmetic unlocks. |
| **Fairness** | Same seed → identical course for every player (`mulberry32`). Server-side plausibility checks on submitted runs. |

Built with React 19, Tailwind 4, Vite, and TypeScript end-to-end (shared
domain/API contract in `src/shared/api.ts`).

## Design notes

- **Splash view** (in the Reddit feed) stays featherweight; the full engine only
  loads in the expanded game view.
- Post titles pass a safety filter before they're rendered into the world.
- Zero external network calls — everything runs on Reddit's platform budget.

---

Built by **[Kobey Dev Services](https://kobeydev.web.app)** — AI automation &
full-stack development. More projects: [git-agent-swarm](https://github.com/git-agent-swarm).
