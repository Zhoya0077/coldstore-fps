[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Zhoya0077/coldstore-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Zhoya0077/coldstore-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# COLDSTORE — a tactical FPS in three.js

An original, round-based tactical shooter in the browser: **Wardens vs
Runners**, 5 against 5 with bots, on an original cold-storage depot map with
two bomb sites. Plant or defuse the breach charge, manage a real economy
across rounds, and win by accuracy — spread and recoil punish run-and-gun,
so stopping, crouching and holding angles pay.

Built as a reusable open-source base for web FPS games: static files only,
no build step, no network requests, three.js 0.187.0 vendored.

## Play

```bash
node serve.ts        # then open http://localhost:8080
```

Click **Deploy**, then click the game to capture the mouse.

| Key | Action |
| --- | --- |
| W A S D / Shift / Ctrl·C / Space | Move / sprint / crouch / jump |
| Mouse / left click / right click | Look / fire / scope the Needle |
| R | Reload |
| 1 · 2 · 3 · 4 | Primary · sidearm · cycle grenade |
| G | Throw selected grenade |
| B | Buy menu (buy phase) |
| E (hold) | Defuse a planted charge |
| Tab | Scoreboard |

## The game

- **Rounds & objective** — 105-second rounds, first to 7 (max 12). Runners
  plant the charge at Freezer A or Dock B (40-second fuse); Wardens win by
  elimination, by the clock, or by defusing (5 s with a kit, 10 s without).
- **Economy** — $800 start; kills, plants, round wins and a growing loss
  bonus feed a buy menu: two rifles classes, an SMG, a scoped bolt-action,
  armour, defuse kits and three grenades (frag, flash, smoke).
- **Gunplay** — hitscan with head/body hit spheres (4× headshots), damage
  falloff, spread driven by movement, airtime, crouch and sustained fire,
  view recoil with recovery, tracers and hitmarkers.
- **Bots** — a waypoint graph over the map (edges derived from line of
  sight), real LOS + FOV perception, a hearing model fed by gunfire and
  footsteps, smoke that genuinely blocks sight, reaction times, burst
  discipline, strafing and crouching in fights, site holds, rotations to
  gunfire, escorts, plant and defuse channels, and per-bot economies.
- **The map** — Coldstore Depot 7: a freezer hall, a crate hall with a
  catwalk, a loading dock, three lanes, two sites. Every solid is one AABB
  list that builds the meshes, the collision world and the radar, so what
  you see is exactly what you collide with.
- **Sound** — fully synthesized with WebAudio (gunfire, explosions, radio
  callouts pitched per team). No audio files.

## Code map

```
game/
  index.html        HUD, menus, styles, import map
  src/
    main.js         boot, fixed-step loop (120 Hz sim), screenshot staging
    state.js        the single match state + tuning constants
    map.js          the map as data: boxes, sites, spawns, waypoints
    physics.js      AABB movement/step-up, raycasts, nav graph + BFS
    fighters.js     the combatant record
    player.js       pointer-lock look, movement, the firing model
    bots.js         bot bodies and brains
    weapons.js      weapon/grenade definitions, hitscan, damage, view models
    rounds.js       the phase machine: buy → live → planted → end, money
    fx.js           tracers, puffs, grenade physics, flash & smoke
    hud.js          HUD, buy menu, scoreboard, radar
    audio.js        synthesized sound effects
  vendor/three/     three.js 0.187.0 (npm build, minified names)
main.ts             the entry program: copies game/ + screenshots/, writes dossier.json
serve.ts            local dev server
```

MIT licensed — see LICENSE. Three.js is MIT (its own LICENSE in
game/vendor/three/).
